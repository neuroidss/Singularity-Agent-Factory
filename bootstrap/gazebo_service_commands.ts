// bootstrap/gazebo_service_commands.ts
export const GAZEBO_SERVICE_COMMANDS_SCRIPT = `
import os
import sys
import json
import subprocess
import time
import re
import traceback
import threading
from datetime import datetime
from io import BytesIO
import base64
import logging
from pymavlink import mavutil

# --- Logging Setup ---
LOG_FILE_PATH = os.path.join(os.path.dirname(__file__), '..', 'assets', 'gazebo_service.log')
# Clear old log file on start
if os.path.exists(LOG_FILE_PATH):
    try:
        os.remove(LOG_FILE_PATH)
    except OSError:
        pass # May be in use

# Configure logging to write to both file and stderr (for MCP)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE_PATH),
        logging.StreamHandler(sys.stderr)
    ]
)

logging.info("--- Gazebo service commands script started ---")

# --- Global State for Health Check ---
SERVICE_STATUS = {
    "web_server_status": "running",
    "ros2_import_status": "pending",
    "ros2_init_status": "pending", # pending, initializing, success, failed
    "simulation_process_status": "stopped", # stopped, running, error
    "error_message": None,
    "drones_connected": [] # List of drone_ids that have sent at least one pose message
}

# --- Deferred Imports ---
rclpy = None
Node = None
qos_profile_sensor_data = None
np = None
Image = None
Float64 = None
TwistStamped = None
PoseStamped = None
RosImage = None
BatteryState = None
CommandBool = None
SetMode = None
CommandTOL = None
Empty = None
ParamSet = None
ParamValue = None
ROS2_AVAILABLE = False


# --- Global State ---
g_ros_node = None
g_simulation_process = None
g_setpoint_pub_process = None
g_node_spinner_thread = None
g_drones = {} # Drone ID -> { state, subscribers, publishers, clients }
g_heartbeat_threads = {}
g_drones_lock = threading.Lock()
g_ros_init_lock = threading.Lock() # Lock to prevent race conditions during initialization

def stream_reader(stream, prefix):
    try:
        for line in iter(stream.readline, b''):
            decoded_line = line.decode('utf-8', errors='replace').strip()
            logging.info(f"[{prefix}] {decoded_line}")
    except ValueError: pass # Stream closed
    finally:
        if stream and not stream.closed: stream.close()

def _cleanup_simulation_processes():
    global g_simulation_process, g_heartbeat_threads, g_setpoint_pub_process
    logging.info("Performing cleanup of simulation processes and heartbeats...")

    # Stop heartbeat threads first
    with g_drones_lock:
        drone_ids_to_stop = list(g_heartbeat_threads.keys())
        for drone_id in drone_ids_to_stop:
            try:
                stop_gcs_heartbeat({'drone_id': drone_id})
            except Exception as e:
                logging.warning(f"Error stopping heartbeat for {drone_id}: {e}")
    
    # Stop setpoint publisher
    if g_setpoint_pub_process and g_setpoint_pub_process.poll() is None:
        try:
            os.killpg(os.getpgid(g_setpoint_pub_process.pid), 15) # SIGTERM
            g_setpoint_pub_process.wait(timeout=2)
        except (ProcessLookupError, OSError, subprocess.TimeoutExpired):
            try:
                os.killpg(os.getpgid(g_setpoint_pub_process.pid), 9) # SIGKILL
                g_setpoint_pub_process.wait(timeout=1)
            except Exception as e:
                 logging.warning(f"Could not kill setpoint publisher process: {e}")
    g_setpoint_pub_process = None

    SERVICE_STATUS["simulation_process_status"] = "stopped"
    if g_simulation_process and g_simulation_process.poll() is None:
        try:
            # Send SIGTERM to the process group
            os.killpg(os.getpgid(g_simulation_process.pid), 15)
            g_simulation_process.wait(timeout=3)
        except (ProcessLookupError, OSError, subprocess.TimeoutExpired):
            try:
                # Force kill if SIGTERM fails
                os.killpg(os.getpgid(g_simulation_process.pid), 9)
                g_simulation_process.wait(timeout=2)
            except Exception as e:
                logging.warning(f"Could not kill managed process group: {e}")
    g_simulation_process = None

    # Kill any other stray processes by name
    for proc_name in ["gzserver", "gzclient", "px4", "MicroXRCEAgent", "mavros_node", "ros_gz_bridge", "topic pub"]:
        try:
            # Use pkill which is more robust
            subprocess.run(f"pkill -15 -f {proc_name}", shell=True, check=False)
            time.sleep(0.2)
            subprocess.run(f"pkill -9 -f {proc_name}", shell=True, check=False)
            logging.info(f"Sent kill signals to any stray '{proc_name}' processes.")
        except Exception as e:
            logging.warning(f"Error killing '{proc_name}': {e}")


# --- ROS2 Node Class & Initialization ---
def _ensure_ros():
    """
    Lazily initializes all ROS2 components on the first call.
    This allows the web service to start even if ROS2 is not sourced.
    """
    global g_ros_node, g_node_spinner_thread, ROS2_AVAILABLE
    global rclpy, Node, qos_profile_sensor_data, np, Image, Float64, TwistStamped, PoseStamped, RosImage, BatteryState, CommandBool, SetMode, CommandTOL, Empty, ParamSet, ParamValue

    with g_ros_init_lock:
        if g_ros_node is not None and rclpy.ok():
            return # Already initialized and running

        if SERVICE_STATUS["ros2_init_status"] == "failed":
            raise RuntimeError(f"ROS2 initialization previously failed: {SERVICE_STATUS['error_message']}")

        # --- 1. Attempt to import libraries ---
        if not ROS2_AVAILABLE:
            SERVICE_STATUS["ros2_import_status"] = "initializing"
            logging.info("Attempting to import ROS2 libraries for the first time...")
            try:
                import rclpy as rclpy_lib
                from rclpy.node import Node as Node_lib
                from rclpy.qos import qos_profile_sensor_data as qos_profile_sensor_data_lib
                import numpy as np_lib
                from PIL import Image as Image_lib
                from std_msgs.msg import Float64 as Float64_lib
                from std_srvs.srv import Empty as Empty_lib
                from geometry_msgs.msg import TwistStamped as TwistStamped_lib, PoseStamped as PoseStamped_lib
                from sensor_msgs.msg import Image as RosImage_lib, BatteryState as BatteryState_lib
                from mavros_msgs.srv import CommandBool as CommandBool_lib, SetMode as SetMode_lib, CommandTOL as CommandTOL_lib, ParamSet as ParamSet_lib
                from mavros_msgs.msg import ParamValue as ParamValue_lib

                rclpy, Node, qos_profile_sensor_data, np, Image = rclpy_lib, Node_lib, qos_profile_sensor_data_lib, np_lib, Image_lib
                Float64, TwistStamped, PoseStamped, RosImage, BatteryState = Float64_lib, TwistStamped_lib, PoseStamped_lib, RosImage_lib, BatteryState_lib
                CommandBool, SetMode, CommandTOL, Empty, ParamSet, ParamValue = CommandBool_lib, SetMode_lib, CommandTOL_lib, Empty_lib, ParamSet_lib, ParamValue_lib
                
                ROS2_AVAILABLE = True
                SERVICE_STATUS["ros2_import_status"] = "success"
                SERVICE_STATUS["error_message"] = None
                logging.info("Successfully imported ROS2 and computer vision libraries.")
            except ImportError as e:
                SERVICE_STATUS["ros2_import_status"] = "failed"
                SERVICE_STATUS["error_message"] = f"Failed to import ROS2 libraries. Ensure ROS2 environment is sourced. Error: {e}"
                logging.error(SERVICE_STATUS["error_message"])
                raise RuntimeError(SERVICE_STATUS["error_message"])

        # --- 2. Initialize ROS context and define Node class ---
        SERVICE_STATUS["ros2_init_status"] = "initializing"
        try:
            class GazeboBridgeNode(Node):
                def __init__(self): super().__init__('gazebo_http_bridge_swarm')
                def setup_drone_ros_interfaces(self, drone_id):
                    with g_drones_lock:
                        if drone_id in g_drones: return
                        logging.info(f"Setting up ROS interfaces for drone: {drone_id}")
                        drone_data = {"subscribers": {}, "publishers": {}, "clients": {}, "message_locks": {}, "latest_messages": {}}
                        g_drones[drone_id] = drone_data
                        ns = f"/{drone_id}"
                        qos = qos_profile_sensor_data
                        self._create_subscriber(drone_id, f'{ns}/camera/image_raw', RosImage, self._image_callback, qos)
                        self._create_subscriber(drone_id, f'{ns}/battery', BatteryState, self._battery_callback, qos)
                        self._create_subscriber(drone_id, f'{ns}/global_position/rel_alt', Float64, self._altitude_callback, qos)
                        self._create_subscriber(drone_id, f'{ns}/local_position/velocity_body', TwistStamped, self._velocity_callback, qos)
                        self._create_subscriber(drone_id, f'{ns}/local_position/pose', PoseStamped, self._pose_callback, qos)
                        drone_data["publishers"]["setpoint_velocity"] = self.create_publisher(TwistStamped, f'{ns}/setpoint_velocity/cmd_vel', 10)
                        drone_data["clients"]["arming"] = self.create_client(CommandBool, f'{ns}/cmd/arming')
                        drone_data["clients"]["set_mode"] = self.create_client(SetMode, f'{ns}/set_mode')
                        drone_data["clients"]["takeoff"] = self.create_client(CommandTOL, f'{ns}/cmd/takeoff')
                def _create_subscriber(self, drone_id, topic, msg_type, cb, qos):
                    d = g_drones[drone_id]; d["message_locks"][topic] = threading.Lock(); d["latest_messages"][topic] = None
                    d["subscribers"][topic] = self.create_subscription(msg_type, topic, lambda msg: cb(drone_id, topic, msg), qos)
                def _image_callback(self, drone_id, topic, msg: RosImage):
                    with g_drones[drone_id]["message_locks"][topic]:
                        try:
                            img_array = np.frombuffer(msg.data, dtype=np.uint8).reshape(msg.height, msg.width, -1)
                            pil_img = Image.fromarray(img_array, 'RGB'); buffered = BytesIO()
                            pil_img.save(buffered, format="JPEG", quality=75)
                            g_drones[drone_id]["latest_messages"][topic] = base64.b64encode(buffered.getvalue()).decode('utf-8')
                        except Exception as e: self.get_logger().error(f"ImgProcError: {e}")
                def _battery_callback(self, drone_id, topic, msg: BatteryState):
                    with g_drones[drone_id]["message_locks"][topic]: g_drones[drone_id]["latest_messages"][topic] = round(msg.percentage * 100, 1)
                def _altitude_callback(self, drone_id, topic, msg: Float64):
                    with g_drones[drone_id]["message_locks"][topic]: g_drones[drone_id]["latest_messages"][topic] = round(msg.data, 2)
                def _velocity_callback(self, drone_id, topic, msg: TwistStamped):
                    with g_drones[drone_id]["message_locks"][topic]: speed = np.sqrt(msg.twist.linear.x**2 + msg.twist.linear.y**2 + msg.twist.linear.z**2); g_drones[drone_id]["latest_messages"][topic] = round(speed, 2)
                def _pose_callback(self, drone_id, topic, msg: PoseStamped):
                    if drone_id not in SERVICE_STATUS["drones_connected"]:
                        SERVICE_STATUS["drones_connected"].append(drone_id)
                        logging.info(f"First telemetry packet received for '{drone_id}'. Link is live.")
                    with g_drones[drone_id]["message_locks"][topic]: pos = msg.pose.position; g_drones[drone_id]["latest_messages"][topic] = {"x": pos.x, "y": pos.y, "z": pos.z}

            if g_ros_node is None or not rclpy.ok():
                if rclpy and rclpy.ok():
                    rclpy.shutdown()
                logging.info("Initializing ROS2 context and node...")
                rclpy.init()
                g_ros_node = GazeboBridgeNode()
                g_node_spinner_thread = threading.Thread(target=lambda: rclpy.spin(g_ros_node))
                g_node_spinner_thread.daemon = True
                g_node_spinner_thread.start()
                logging.info("ROS2 node and spinner thread started successfully.")
            
            SERVICE_STATUS["ros2_init_status"] = "success"
        except Exception as e:
            SERVICE_STATUS["ros2_init_status"] = "failed"
            error_msg = f"ROS2 node initialization failed: {e}"
            SERVICE_STATUS["error_message"] = error_msg
            logging.error(error_msg)
            if rclpy and rclpy.ok(): rclpy.shutdown()
            g_ros_node = None
            raise RuntimeError(error_msg)

def _call_ros_service(client, request, timeout_sec=3.0):
    _ensure_ros()
    logging.info(f"Calling ROS service '{client.srv_name}'...")
    if not client.wait_for_service(timeout_sec=2.0): raise RuntimeError(f"Service '{client.srv_name}' not available.")
    future = client.call_async(request)
    # Use a timeout in spin_until_future_complete to prevent indefinite blocking
    rclpy.spin_until_future_complete(g_ros_node, future, timeout_sec=timeout_sec)
    if future.done() and future.result() is not None:
        logging.info(f"Service call to '{client.srv_name}' successful.")
        return future.result()
    else:
        # Cancel the future if it's still running
        if not future.done():
            future.cancel()
        raise RuntimeError(f"Service call to '{client.srv_name}' timed out after {timeout_sec}s.")


def _heartbeat_loop(stop_event, mav_connection):
    """Sends a GCS heartbeat once per second."""
    while not stop_event.is_set():
        try:
            mav_connection.mav.heartbeat_send(
                mavutil.mavlink.MAV_TYPE_GCS,
                mavutil.mavlink.MAV_AUTOPILOT_INVALID,
                0, 0, 0
            )
            logging.info("GCS Heartbeat sent.")
        except Exception as e:
            logging.error(f"Error sending GCS heartbeat: {e}")
            break
        # Wait for 1 second, but check the stop event periodically
        stop_event.wait(1)
    logging.info("GCS Heartbeat loop stopped.")

# --- API Commands ---
def start_gcs_heartbeat(payload):
    global g_heartbeat_threads
    drone_id = payload.get('drone_id')
    if not drone_id: raise ValueError("drone_id is required.")

    with g_drones_lock:
        if drone_id in g_heartbeat_threads and g_heartbeat_threads[drone_id]['thread'].is_alive():
            return {"message": f"GCS heartbeat for '{drone_id}' is already running."}

        # PX4 SITL listens for a GCS (like QGroundControl) on UDP port 18570 by default.
        connection_string = 'udpout:127.0.0.1:18570'
        logging.info(f"Starting GCS heartbeat emulation for '{drone_id}' on {connection_string}...")
        
        try:
            mav_connection = mavutil.mavlink_connection(connection_string)
            stop_event = threading.Event()
            heartbeat_thread = threading.Thread(target=_heartbeat_loop, args=(stop_event, mav_connection))
            heartbeat_thread.daemon = True
            heartbeat_thread.start()
            
            g_heartbeat_threads[drone_id] = {'thread': heartbeat_thread, 'stop_event': stop_event, 'conn': mav_connection}
            
            return {"message": f"GCS heartbeat emulation started for '{drone_id}'."}
        except Exception as e:
            raise RuntimeError(f"Failed to start GCS heartbeat for '{drone_id}': {e}")

def stop_gcs_heartbeat(payload):
    global g_heartbeat_threads
    drone_id = payload.get('drone_id')
    if not drone_id: raise ValueError("drone_id is required.")

    with g_drones_lock:
        if drone_id in g_heartbeat_threads:
            logging.info(f"Stopping GCS heartbeat for '{drone_id}'...")
            g_heartbeat_threads[drone_id]['stop_event'].set()
            g_heartbeat_threads[drone_id]['thread'].join(timeout=2)
            g_heartbeat_threads[drone_id]['conn'].close()
            del g_heartbeat_threads[drone_id]
            return {"message": f"GCS heartbeat emulation stopped for '{drone_id}'."}
        else:
            return {"message": f"No active GCS heartbeat for '{drone_id}' to stop."}
            
def start_gazebo_simulation(payload):
    logging.info(f"Received command 'start_gazebo_simulation' with payload: {json.dumps(payload)}")
    _ensure_ros()
    global g_simulation_process
    logging.info("Cleaning up any previous simulation sessions first.")
    _cleanup_simulation_processes(); time.sleep(1)

    drone_model = payload.get('drone_model', 'gz_x500')
    # Derives drone_id like 'x500_0' or 'x500_mono_cam_down_0' from model name
    drone_id = drone_model.replace('gz_', '') + '_0'
    logging.info(f"Resolved drone_model '{drone_model}' to drone_id '{drone_id}'")

    # 1. Start GCS Heartbeat emulation for the new drone (EARLY)
    try:
        logging.info(f"Starting automatic GCS heartbeat emulation for {drone_id}...")
        start_gcs_heartbeat({'drone_id': drone_id})
    except Exception as e:
        logging.warning(f"Could not start automatic GCS heartbeat for {drone_id}: {e}. Manual arming might be required.")
    
    # 2. Start MicroXRCEAgent
    try:
        logging.info("Starting MicroXRCEAgent...");
        subprocess.Popen("MicroXRCEAgent udp4 -p 8888", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, preexec_fn=os.setsid)
        time.sleep(2); logging.info("MicroXRCEAgent started.")
    except Exception as e: raise RuntimeError(f"Failed to start MicroXRCEAgent: {e}")
    
    # 3. Start PX4 SITL + Gazebo
    px4_dir = os.path.expanduser("~/git/PX4-Autopilot")
    if not os.path.isdir(px4_dir): raise FileNotFoundError(f"PX4-Autopilot directory not found at '{px4_dir}'.")
    
    cmd = f"make px4_sitl {drone_model}"
    
    logging.info(f"Starting Gazebo and PX4 from '{px4_dir}' with command: '{cmd}'")
    try:
        g_simulation_process = subprocess.Popen(cmd, shell=True, cwd=px4_dir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=False, preexec_fn=os.setsid)
        threading.Thread(target=stream_reader, args=(g_simulation_process.stdout, "GAZEBO_OUT"), daemon=True).start()
        threading.Thread(target=stream_reader, args=(g_simulation_process.stderr, "GAZEBO_ERR"), daemon=True).start()
        logging.info("Started log streaming for Gazebo and PX4.")
        SERVICE_STATUS["simulation_process_status"] = "running"
    except Exception as e:
        SERVICE_STATUS["simulation_process_status"] = "error"
        _cleanup_simulation_processes()
        raise RuntimeError(f"Failed to start Gazebo process: {e}")

    # 4. Start MAVROS node
    time.sleep(10)
    logging.info(f"Starting MAVROS node for {drone_id}...")
    mavros_cmd = f'ros2 run mavros mavros_node --ros-args -r __ns:=/{drone_id} -p fcu_url:="udp://:14540@127.0.0.1:14580" -p gcs_url:="udp://@localhost"'
    try:
        mavros_process = subprocess.Popen(mavros_cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=False, preexec_fn=os.setsid)
        threading.Thread(target=stream_reader, args=(mavros_process.stdout, "MAVROS_OUT"), daemon=True).start()
        threading.Thread(target=stream_reader, args=(mavros_process.stderr, "MAVROS_ERR"), daemon=True).start()
        logging.info(f"MAVROS process for {drone_id} spawned with '__ns' namespacing.")
    except Exception as e:
        _cleanup_simulation_processes()
        raise RuntimeError(f"Failed to start MAVROS node for {drone_id}: {e}")

    # 5. Start the Gazebo -> ROS2 camera bridge
    time.sleep(2)
    logging.info(f"Starting Gazebo to ROS2 camera bridge for {drone_id}...")
    bridge_cmd = f'ros2 run ros_gz_bridge parameter_bridge "/world/default/model/{drone_id}/link/camera_link/sensor/imager/image@sensor_msgs/msg/Image@gz.msgs.Image" --ros-args --remap /world/default/model/{drone_id}/link/camera_link/sensor/imager/image:=/{drone_id}/camera/image_raw'
    
    try:
        bridge_process = subprocess.Popen(bridge_cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=False, preexec_fn=os.setsid)
        threading.Thread(target=stream_reader, args=(bridge_process.stdout, "GZ_BRIDGE_OUT"), daemon=True).start()
        threading.Thread(target=stream_reader, args=(bridge_process.stderr, "GZ_BRIDGE_ERR"), daemon=True).start()
        logging.info("Camera bridge process spawned.")
    except Exception as e:
        _cleanup_simulation_processes()
        raise RuntimeError(f"Failed to start ROS Gazebo bridge: {e}")
        
    # 6. Wait for Gazebo services and PX4 to be ready, then unpause and configure
    time.sleep(5)

    # 6a. Robustly unpause the simulation
    logging.info("Attempting to unpause Gazebo simulation...")
    unpaused = False
    unpause_cmd = "gz service -s /world/default/control --reqtype gz.msgs.WorldControl --reptype gz.msgs.Boolean --req 'pause: false'"
    for attempt in range(3):
        try:
            logging.info(f"Unpause attempt {attempt+1} with command: {unpause_cmd}")
            result = subprocess.run(unpause_cmd, shell=True, check=True, capture_output=True, text=True, timeout=5)
            if "true" in result.stdout.lower():
                 logging.info("✅ Gazebo simulation has been unpaused via gz service call.")
                 unpaused = True
                 break
            else:
                 logging.warning(f"Unpause attempt {attempt+1}: command succeeded but did not confirm unpause. stdout: {result.stdout}")

        except Exception as e:
            stderr = e.stderr if hasattr(e, 'stderr') else ''
            if "World is not paused" in str(stderr):
                logging.info("✅ Simulation is already unpaused.")
                unpaused = True
                break
            logging.warning(f"⚠️ Unpause attempt {attempt+1} failed: {e}. Stderr: {stderr}. Retrying in 2 seconds...")
        time.sleep(2)

    if not unpaused:
        logging.warning("⚠️ Could not confirm simulation is unpaused. Continuing startup, but issues may arise.")

    # 6b. Wait for PX4 to stabilize after unpause
    logging.info("Waiting 3 seconds for MAVROS services to be ready after unpause...")
    time.sleep(3)
    
    # 7. Start publishing setpoint in parallel
    logging.info(f"Starting parallel setpoint publisher for {drone_id}...")
    pub_cmd = f'''ros2 topic pub /{drone_id}/setpoint_position/local geometry_msgs/msg/PoseStamped "
header:
  stamp:
    sec: 0
    nanosec: 0
  frame_id: 'map'
pose:
  position:
    x: 0.0
    y: 0.0
    z: 2.5
  orientation:
    x: 0.0
    y: 0.0
    z: 0.0
    w: 1.0
" --rate 10'''
    try:
        global g_setpoint_pub_process
        g_setpoint_pub_process = subprocess.Popen(pub_cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=False, preexec_fn=os.setsid)
        threading.Thread(target=stream_reader, args=(g_setpoint_pub_process.stderr, f"SETPT_PUB_{drone_id}_ERR"), daemon=True).start()
        logging.info("Setpoint publisher process started.")
        time.sleep(1) # Give it a moment to start publishing
    except Exception as e:
        _cleanup_simulation_processes()
        raise RuntimeError(f"Failed to start setpoint publisher: {e}")

    # 8. Set mode to OFFBOARD
    logging.info(f"Setting mode to OFFBOARD for {drone_id}...")
    try:
        offboard_cmd = ['ros2', 'service', 'call', f'/{drone_id}/set_mode', 'mavros_msgs/srv/SetMode', "{{custom_mode: 'OFFBOARD'}}"]
        logging.info(f"Executing: {' '.join(offboard_cmd)}")
        result = subprocess.run(offboard_cmd, check=True, capture_output=True, text=True, timeout=10)
        if 'success: true' in result.stdout.lower():
            logging.info("Successfully set mode to OFFBOARD.")
        else:
            logging.warning(f"Set mode to OFFBOARD command was called, but success not confirmed. stdout: {result.stdout}")
    except Exception as e:
        stderr_output = e.stderr if hasattr(e, 'stderr') else ''
        logging.error(f"Failed to set mode to OFFBOARD. Error: {e}. Stderr: {stderr_output}")
        _cleanup_simulation_processes()
        raise

    # 9. Arm the drone
    logging.info(f"Arming drone {drone_id}...")
    try:
        arm_cmd = ['ros2', 'service', 'call', f'/{drone_id}/cmd/arming', 'mavros_msgs/srv/CommandBool', "{{value: true}}"]
        logging.info(f"Executing: {' '.join(arm_cmd)}")
        result = subprocess.run(arm_cmd, check=True, capture_output=True, text=True, timeout=10)
        if 'success: true' in result.stdout.lower():
            logging.info(f"Successfully armed {drone_id}.")
        else:
            logging.warning(f"Arm command was called, but success not confirmed. stdout: {result.stdout}")
    except Exception as e:
        stderr_output = e.stderr if hasattr(e, 'stderr') else ''
        logging.error(f"Failed to arm drone. Error: {e}. Stderr: {stderr_output}")
        _cleanup_simulation_processes()
        raise

    return {"message": "Gazebo simulation started, setpoint publishing, drone armed for takeoff."}

def stop_gazebo_simulation(payload):
    logging.info("Received command 'stop_gazebo_simulation'")
    _cleanup_simulation_processes()
    return {"message": "Simulation stop command executed."}

def spawn_drone(payload):
    logging.info(f"Received command 'spawn_drone' with payload: {json.dumps(payload)}")
    _ensure_ros()
    drone_id = payload.get('drone_id')
    if not drone_id: raise ValueError("drone_id is a required parameter.")
    g_ros_node.setup_drone_ros_interfaces(drone_id)
    return {"message": f"Drone '{drone_id}' registered with ROS bridge."}

def get_swarm_state(payload):
    _ensure_ros()
    swarm_state = {};
    with g_drones_lock:
        for drone_id, drone_data in g_drones.items():
            state = {};
            for topic, lock in drone_data["message_locks"].items():
                with lock:
                    key = topic.split('/')[-1]
                    if 'image_raw' in topic:
                        key = 'image_raw'
                    elif 'local_position' in topic:
                        key = 'pose' if 'pose' in topic else ('velocity' if 'velocity' in topic else key)
                    if key == "rel_alt": key = "altitude"
                    state[key] = drone_data["latest_messages"][topic]
            swarm_state[drone_id] = state
    return {"swarm_state": swarm_state}

def get_service_status(payload={}):
    with g_ros_init_lock:
        if SERVICE_STATUS['ros2_import_status'] == 'pending':
            try:
                import rclpy
                SERVICE_STATUS['ros2_import_status'] = 'available'
            except ImportError:
                SERVICE_STATUS['ros2_import_status'] = 'unavailable'
                SERVICE_STATUS['error_message'] = "ROS2 libraries not found in Python path. Is the environment sourced?"
    if g_simulation_process and g_simulation_process.poll() is not None:
        SERVICE_STATUS["simulation_process_status"] = "stopped"
    return SERVICE_STATUS

def arm_drone(payload):
    logging.info(f"Received command 'arm_drone' for drone: {payload.get('drone_id')}")
    try:
        _ensure_ros()
        drone_id = payload.get('drone_id')
        if not drone_id or drone_id not in g_drones: raise ValueError("Valid drone_id is required.")
        req = CommandBool.Request(); req.value = True
        response = _call_ros_service(g_drones[drone_id]["clients"]["arming"], req)
        if response.success: return {"message": f"Arming command acknowledged for {drone_id}. Result: {response.result}"}
        else: raise RuntimeError(f"Arming for {drone_id} failed with result code: {response.result}")
    except Exception as e:
        logging.error(f"Error in arm_drone: {e}\\n{traceback.format_exc()}")
        raise

def set_drone_mode(payload):
    logging.info(f"Received command 'set_drone_mode' for drone: {payload.get('drone_id')}, mode: {payload.get('mode')}")
    try:
        _ensure_ros()
        drone_id = payload.get('drone_id'); mode = payload.get('mode', 'OFFBOARD')
        if not drone_id or drone_id not in g_drones: raise ValueError("Valid drone_id is required.")
        req = SetMode.Request(); req.custom_mode = mode
        response = _call_ros_service(g_drones[drone_id]["clients"]["set_mode"], req)
        if response.mode_sent: return {"message": f"Set Mode '{mode}' command acknowledged for {drone_id}."}
        else: raise RuntimeError(f"Set Mode command for {drone_id} failed to send.")
    except Exception as e:
        logging.error(f"Error in set_drone_mode: {e}\\n{traceback.format_exc()}")
        raise

def command_drone_takeoff(payload):
    logging.info(f"Received command 'command_drone_takeoff' for drone: {payload.get('drone_id')}")
    try:
        _ensure_ros()
        drone_id = payload.get('drone_id'); altitude = payload.get('altitude', 5.0)
        if not drone_id or drone_id not in g_drones: raise ValueError("Valid drone_id is required.")
        req = CommandTOL.Request(); req.altitude = float(altitude); req.latitude=float('nan'); req.longitude=float('nan'); req.yaw=float('nan')
        response = _call_ros_service(g_drones[drone_id]["clients"]["takeoff"], req, timeout_sec=5.0)
        if response.success: return {"message": f"Takeoff command acknowledged for {drone_id}."}
        else: raise RuntimeError(f"Takeoff for {drone_id} failed with result code: {response.result}")
    except Exception as e:
        logging.error(f"Error in command_drone_takeoff: {e}\\n{traceback.format_exc()}")
        raise

def set_drone_velocity(payload):
    try:
        _ensure_ros()
        drone_id = payload.get('drone_id')
        if not drone_id or drone_id not in g_drones: raise ValueError("Valid drone_id is required.")
        pub = g_drones[drone_id]["publishers"]["setpoint_velocity"]; msg = TwistStamped()
        msg.header.stamp = g_ros_node.get_clock().now().to_msg(); msg.header.frame_id = "base_link"
        msg.twist.linear.x = float(payload.get('forward', 0.0)); msg.twist.linear.y = float(payload.get('right', 0.0))
        msg.twist.linear.z = float(payload.get('up', 0.0)); msg.twist.angular.z = float(payload.get('yaw_rate', 0.0))
        pub.publish(msg)
        return {"message": f"Velocity command published to {drone_id}."}
    except Exception as e:
        logging.error(f"Error in set_drone_velocity: {e}\\n{traceback.format_exc()}")
        raise

def set_px4_parameter(payload):
    # This function now uses the direct ros2 service call method for robustness.
    # The old MAVLink method is preserved below for reference but is no longer used.
    drone_id = payload.get('drone_id')
    param_name = payload.get('param_name')
    param_value = payload.get('param_value')
    if not drone_id or not param_name or param_value is None:
        raise ValueError("drone_id, param_name, and param_value are required.")

    logging.info(f"Setting parameter '{param_name}' to '{param_value}' for '{drone_id}' via ROS2 service call...")
    
    value_type_str = ""
    if isinstance(param_value, float):
        value_type_str = f"{{type: 8, double_value: {float(param_value)}}}"
    elif isinstance(param_value, int):
        value_type_str = f"{{type: 6, integer_value: {int(param_value)}}}"
    else:
        raise ValueError("param_value must be an integer or a float.")

    try:
        request_body = f"{{force_set: true, param_id: '{param_name}', value: {value_type_str}}}"
        param_set_cmd = ['ros2', 'service', 'call', f'/{drone_id}/param/set', 'mavros_msgs/srv/ParamSetV2', request_body]
        logging.info(f"Executing: {' '.join(param_set_cmd)}")
        result = subprocess.run(param_set_cmd, check=True, capture_output=True, text=True, timeout=10)
        
        if 'success: true' in result.stdout.lower():
            logging.info(f"Successfully set parameter '{param_name}'.")
            return {"message": f"Successfully set '{param_name}' to '{param_value}'."}
        else:
            logging.warning(f"Parameter '{param_name}' set command was called, but success not confirmed in output. stdout: {result.stdout}")
            raise RuntimeError(f"Failed to confirm parameter set. Output: {result.stdout}")

    except Exception as e:
        stderr_output = e.stderr if hasattr(e, 'stderr') else ''
        logging.error(f"Failed to set PX4 parameter '{param_name}' via ros2 service call. Error: {e}. Stderr: {stderr_output}")
        raise
`