// bootstrap/gamepad_service_commands.ts
export const GAMEPAD_SERVICE_COMMANDS_SCRIPT = `
import uinput
import time
import atexit
import sys

# --- Globals ---
virtual_device = None

# --- Device Definition ---
# A standard Xbox-style gamepad layout
GAMEPAD_EVENTS = (
    uinput.BTN_SOUTH,   # A
    uinput.BTN_EAST,    # B
    uinput.BTN_NORTH,   # X
    uinput.BTN_WEST,    # Y
    uinput.BTN_TL,      # L1
    uinput.BTN_TR,      # R1
    uinput.BTN_SELECT,  # Back
    uinput.BTN_START,   # Start
    uinput.BTN_THUMBL,  # L3
    uinput.BTN_THUMBR,  # R3
    uinput.BTN_DPAD_UP,
    uinput.BTN_DPAD_DOWN,
    uinput.BTN_DPAD_LEFT,
    uinput.BTN_DPAD_RIGHT,
    uinput.ABS_X + (-32768, 32767, 0, 0),  # Left Stick X
    uinput.ABS_Y + (-32768, 32767, 0, 0),  # Left Stick Y
    uinput.ABS_RX + (-32768, 32767, 0, 0), # Right Stick X
    uinput.ABS_RY + (-32768, 32767, 0, 0), # Right Stick Y
    uinput.ABS_Z + (0, 1023, 0, 0),       # L2 Trigger
    uinput.ABS_RZ + (0, 1023, 0, 0),      # R2 Trigger
)

# --- Cleanup ---
def cleanup_device():
    global virtual_device
    if virtual_device:
        print("INFO: Cleaning up virtual uinput device...", file=sys.stderr)
        virtual_device.destroy()
        virtual_device = None

atexit.register(cleanup_device)

# --- Commands ---

def create_device(payload):
    global virtual_device
    if virtual_device:
        return {"message": "Virtual gamepad already exists."}
    
    try:
        virtual_device = uinput.Device(GAMEPAD_EVENTS, name="Singularity Virtual Gamepad")
        # Give the system a moment to recognize the new device
        time.sleep(1)
        return {"message": "Virtual gamepad created successfully."}
    except Exception as e:
        error_message = f"Failed to create virtual gamepad. Ensure you have permissions for /dev/uinput. Try running 'sudo modprobe uinput' and 'sudo chmod 666 /dev/uinput'. Original error: {e}"
        print(f"ERROR: {error_message}", file=sys.stderr)
        raise RuntimeError(error_message)


def set_button_state(payload):
    global virtual_device
    if not virtual_device:
        try:
            create_device({})
            print("INFO: Gamepad device was missing. Re-initialized.", file=sys.stderr)
        except Exception as e:
            raise RuntimeError(f"Virtual gamepad not created and could not be re-initialized. Error: {e}")
    
    button_name = payload.get('button_name')
    state = payload.get('state') # 0 for release, 1 for press
    
    if not button_name or state is None:
        raise ValueError("Missing 'button_name' or 'state' argument.")
        
    try:
        button_event = getattr(uinput, button_name)
        virtual_device.emit(button_event, int(state))
        action = "pressed" if int(state) == 1 else "released"
        return {"message": f"Button {button_name} {action}."}
    except AttributeError:
        raise ValueError(f"Invalid button name: {button_name}")

def move_stick(payload):
    global virtual_device
    if not virtual_device:
        try:
            create_device({})
            print("INFO: Gamepad device was missing. Re-initialized.", file=sys.stderr)
        except Exception as e:
            raise RuntimeError(f"Virtual gamepad not created and could not be re-initialized. Error: {e}")

    stick_name = payload.get('stick_name') # "left" or "right"
    x_val = payload.get('x', 0.0)
    y_val = payload.get('y', 0.0)

    # Defensive check for None/null values which can cause float() to fail
    if x_val is None:
        x_val = 0.0
    if y_val is None:
        y_val = 0.0
    
    if stick_name not in ["left", "right"]:
        raise ValueError("Invalid stick_name. Must be 'left' or 'right'.")

    # Scale -1.0 to 1.0 float to -32767 to 32767 integer
    x_int = int(max(-1.0, min(1.0, float(x_val))) * 32767)
    y_int = int(max(-1.0, min(1.0, float(y_val))) * 32767)
    
    if stick_name == "left":
        virtual_device.emit(uinput.ABS_X, x_int, syn=False)
        virtual_device.emit(uinput.ABS_Y, y_int)
    else: # right
        virtual_device.emit(uinput.ABS_RX, x_int, syn=False)
        virtual_device.emit(uinput.ABS_RY, y_int)
        
    return {"message": f"Moved {stick_name} stick to ({x_val:.2f}, {y_val:.2f})."}
`;