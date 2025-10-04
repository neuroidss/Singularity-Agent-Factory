// bootstrap/gamepad_service.ts

export const GAMEPAD_SERVICE_SCRIPT = `
import uvicorn
from fastapi import FastAPI, HTTPException, Body
from typing import Dict, Any
import sys
import os
import traceback

sys.path.append(os.path.dirname(__file__))
import gamepad_service_commands

app = FastAPI(
    title="Virtual Gamepad Service",
    description="A service to manage a virtual uinput gamepad for simulating controller inputs.",
    version="1.0.0"
)

@app.on_event("startup")
async def startup_event():
    # Automatically create the device on startup
    try:
        gamepad_service_commands.create_device({})
        print("INFO: Virtual gamepad device initialized on service startup.")
    except Exception as e:
        print(f"ERROR: Could not create virtual gamepad on startup: {e}", file=sys.stderr)

@app.post("/command/{command_name}")
async def execute_command(command_name: str, payload: Dict[str, Any] = Body(...)):
    command_func = getattr(gamepad_service_commands, command_name, None)
    
    if not callable(command_func):
        raise HTTPException(status_code=404, detail=f"Command '{command_name}' not found.")
        
    try:
        result = command_func(payload)
        return result
    except Exception as e:
        trace = traceback.format_exc()
        print(f"ERROR executing '{command_name}': {e}\\n{trace}", file=sys.stderr)
        raise HTTPException(status_code=500, detail={"error": str(e), "trace": trace})

@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "Gamepad Service is running."}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="127.0.0.1", port=port)
`;
