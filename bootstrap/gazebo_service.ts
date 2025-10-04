// bootstrap/gazebo_service.ts
export const GAZEBO_SERVICE_SCRIPT = `
import uvicorn
from fastapi import FastAPI, HTTPException, Body
from typing import Dict, Any
import sys
import os
import json
import traceback
import asyncio
from concurrent.futures import ThreadPoolExecutor

sys.path.append(os.path.dirname(__file__))
import gazebo_service_commands

app = FastAPI(
    title="Gazebo Simulation Service",
    description="A service to manage a Gazebo simulation via ROS2.",
    version="1.0.0"
)

# A thread pool to run blocking ROS2 calls without freezing the server
executor = ThreadPoolExecutor()

@app.post("/command/{command_name}")
async def execute_command(command_name: str, payload: Dict[str, Any] = Body(...)):
    command_func = getattr(gazebo_service_commands, command_name, None)
    if not callable(command_func):
        raise HTTPException(status_code=404, detail=f"Command '{command_name}' not found.")
    try:
        # Run the potentially blocking sync function in a separate thread
        # to avoid blocking the main asyncio event loop.
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            executor,
            command_func, # The synchronous function to run
            payload       # Its arguments
        )
        return result
    except Exception as e:
        trace = traceback.format_exc()
        # Log to stderr so the parent MCP process can capture it.
        print(f"ERROR executing '{command_name}' with payload: {json.dumps(payload)}\\n{e}\\n{trace}", file=sys.stderr)
        raise HTTPException(status_code=500, detail={"error": str(e), "trace": trace, "payload": payload})

@app.get("/health")
async def health_check():
    """
    Returns a detailed status of the service, including ROS2 initialization
    and drone connectivity. Always returns 200 OK if the web server is running,
    with the body indicating the actual underlying system health.
    """
    status = gazebo_service_commands.get_service_status()
    return status

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8002))
    uvicorn.run(app, host="127.0.0.1", port=port)
`;