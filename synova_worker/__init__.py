"""synova_worker — Python sidecar for SynovaAgent connectors."""
import sys, json, importlib

def main():
    line = sys.stdin.readline()
    if not line:
        print(json.dumps({"success": False, "error": {"message": "No input"}}))
        return
    try:
        request = json.loads(line)
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": {"message": f"JSON parse: {e}"}}))
        return

    command = request.get("command", "")
    params = request.get("params", {})
    request_id = request.get("requestId", "unknown")

    # ping health check
    if command == "ping":
        print(json.dumps({"requestId": request_id, "success": True, "result": {"status": "ok"}}))
        return

    try:
        if ":" in command:
            module_name, func_name = command.split(":", 1)
        else:
            module_name = command
            func_name = "handle"

        mod = importlib.import_module(f"synova_worker.{module_name}")
        handler = getattr(mod, f"handle_{func_name}", None)
        if not handler:
            print(json.dumps({"requestId": request_id, "success": False,
                "error": {"code": "NOT_FOUND", "message": f"Handler not found: {func_name} in {module_name}"}}))
            return

        result = handler(params)
        print(json.dumps({"requestId": request_id, "success": True, "result": result}))
    except Exception as e:
        print(json.dumps({"requestId": request_id, "success": False,
            "error": {"code": type(e).__name__, "message": str(e)}}))

if __name__ == "__main__":
    main()
