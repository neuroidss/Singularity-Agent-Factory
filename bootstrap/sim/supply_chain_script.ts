// bootstrap/sim/supply_chain_script.ts

export const SUPPLY_CHAIN_SCRIPT = `
import argparse
import json
import sys
import time
import random

# --- Configuration ---
# Simulation parameters are now held internally, removing the need for an external file.
SIMULATED_STOCK_PARAMS = {
    "ADS131M08": {
        "description": "8-Channel ADC",
        "find_chance": 0.6,
        "max_stock": 50,
        "lead_time_days": 14
    },
    "LP5907QMFX-3.3Q1": {
        "description": "3.3V LDO Voltage Regulator",
        "find_chance": 0.9,
        "max_stock": 2500,
        "lead_time_days": 0
    },
    "ECS-2520MV": {
        "description": "8.192MHz Oscillator",
        "find_chance": 0.7,
        "max_stock": 300,
        "lead_time_days": 7
    },
    "CAP_SMD_0603": {
        "description": "Generic 0603 Capacitor",
        "find_chance": 0.98,
        "max_stock": 10000,
        "lead_time_days": 0
    },
    "POGO_PIN_SMD": {
        "description": "SMD Pogo Pin",
        "find_chance": 0.85,
        "max_stock": 2000,
        "lead_time_days": 0
    },
    "XIAO_HEADER_SMD": {
        "description": "1x7 2.54mm SMD Pin Header",
        "find_chance": 0.95,
        "max_stock": 500,
        "lead_time_days": 0
    }
}

def main():
    parser = argparse.ArgumentParser(description="Simulates a query to a supplier stock database.")
    parser.add_argument('--part-number', required=True, help='The part number to query.')
    args = parser.parse_args()

    # Simulate network latency and processing time
    time.sleep(random.uniform(0.5, 2.0))

    part_params = SIMULATED_STOCK_PARAMS.get(args.part_number)

    if part_params and random.random() < part_params.get("find_chance", 0.75):
        # Simulate variable stock levels
        stock_level = random.randint(1, part_params.get("max_stock", 1000))
        result = {
            "part_number": args.part_number,
            "in_stock": stock_level,
            "supplier": random.choice(["Digi-Key (Sim)", "Mouser (Sim)", "LCSC (Sim)"]),
            "lead_time_days": part_params.get("lead_time_days", 0)
        }
    else:
        result = {
            "part_number": args.part_number,
            "in_stock": 0,
            "supplier": None,
            "lead_time_days": None
        }
    
    # The tool's output must be printed to stdout
    print(json.dumps(result))

if __name__ == "__main__":
    main()
`;