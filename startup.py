import os
import subprocess
import sys
import argparse

def run_command(command, cwd=None, env=None):
    """Helper to run shell commands and exit on failure."""
    result = subprocess.run(command, shell=True, cwd=cwd, env=env)
    if result.returncode != 0:
        print(f"Error: Command '{command}' failed.")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="App Startup Script")
    parser.add_argument('mode', nargs='?', default='prod', choices=['dev', 'prod'], 
                        help="Run in 'dev' or 'prod' mode")
    args = parser.parse_args()

    print(f"🚀 Starting app in {args.mode.upper()} mode...")

    # 1. GIT UPDATES
    if args.mode == 'prod':
        print("Checking for updates...")
        run_command("git pull origin main")

    # 2. BACKEND Setup
    print("Checking Backend dependencies...")
    if not os.path.exists(".venv"):
        print("Creating virtual environment...")
        run_command(f"{sys.executable} -m venv .venv")
    
    # Define absolute path to pip/uvicorn to avoid CWD issues
    root_dir = os.path.abspath(os.path.dirname(__file__))
    venv_dir = os.path.join(root_dir, ".venv")
    
    if os.name == 'nt':
        pip_bin = os.path.join(venv_dir, "Scripts", "pip")
        uvicorn_bin = os.path.join(venv_dir, "Scripts", "uvicorn")
    else:
        pip_bin = os.path.join(venv_dir, "bin", "pip")
        uvicorn_bin = os.path.join(venv_dir, "bin", "uvicorn")

    run_command(f"{pip_bin} install -r backend/requirements.txt")

    # 3. FRONTEND Setup
    print("Checking Frontend dependencies...")
    if not os.path.isdir("frontend/node_modules"):
        print("node_modules not found. Installing...")
        run_command("npm install", cwd="frontend")

    # 4. PREPARE ENVIRONMENT (The PYTHONPATH Fix)
    custom_env = os.environ.copy()
    backend_abs_path = os.path.abspath("backend")
    
    # Prepend backend to PYTHONPATH
    existing_pythonpath = custom_env.get("PYTHONPATH", "")
    custom_env["PYTHONPATH"] = f"{backend_abs_path}{os.pathsep}{existing_pythonpath}"

    # 5. START THE APP
    print("✅ System check complete. Launching...")
    
    if args.mode == 'dev':
        print("Starting FastAPI (Dev mode)...")
        # uvicorn_bin is now an absolute path, so it won't matter that we are in /backend
        backend_cmd = f"{uvicorn_bin} main:app --reload"
        run_command(backend_cmd, cwd="backend", env=custom_env)
        
    else:
        print("Building frontend and starting Production...")
        run_command("npm run build", cwd="frontend")
        run_command(f"{uvicorn_bin} main:app", cwd="backend", env=custom_env)

if __name__ == "__main__":
    main()