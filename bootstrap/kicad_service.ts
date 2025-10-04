// bootstrap/kicad_service.ts

export const KICAD_SERVICE_SCRIPT = `
import uvicorn
from fastapi import FastAPI, HTTPException, Body
from typing import Dict, Any
import sys
import os
import json
import traceback

# Add script directory to path to allow importing commands module
sys.path.append(os.path.dirname(__file__))

# The command implementations are in a separate file
import kicad_service_commands

app = FastAPI(
    title="KiCad Automation Service",
    description="A long-running service to handle KiCad automation tasks without repeated library loading.",
    version="1.0.0"
)

# Generic command endpoint
@app.post("/command/{command_name}")
async def execute_command(command_name: str, payload: Dict[str, Any] = Body(...)):
    """
    Executes a KiCad command by dynamically calling a function
    from the kicad_service_commands module.
    """
    # Convert tool name from JS-style (e.g., defineComponent) to Python-style (define_component)
    # The tool name from implementationCode is already snake_case, so no conversion needed.
    func_name = command_name
    
    command_func = getattr(kicad_service_commands, func_name, None)
    
    if not callable(command_func):
        raise HTTPException(status_code=404, detail=f"Command '{func_name}' not found in service commands.")
        
    try:
        # The command functions now directly accept the dictionary payload
        result = command_func(payload)
        # FastAPI will automatically convert the dictionary to a JSON response
        return result
    except Exception as e:
        # Log the full traceback to the service's stderr for debugging
        trace = traceback.format_exc()
        # Log the payload that caused the error for better debugging
        print(f"ERROR executing '{func_name}' with payload: {json.dumps(payload)}\\n{e}\\n{trace}", file=sys.stderr)
        # Raise an HTTPException, which FastAPI turns into a proper error response
        raise HTTPException(status_code=500, detail={"error": str(e), "trace": trace, "payload": payload})

@app.get("/health")
async def health_check():
    """A simple health check endpoint to verify the service is running."""
    return {"status": "ok", "message": "KiCad Service is running."}

if __name__ == "__main__":
    # Get port from environment variable or default to 8000
    port = int(os.environ.get("PORT", 8000))
    # Bind to 127.0.0.1 to ensure it's only accessible locally
    uvicorn.run(app, host="127.0.0.1", port=port)
`;