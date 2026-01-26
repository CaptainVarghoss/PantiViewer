import shlex, json

def flatten_exif_to_fts(location_id, path, filename, exif_json):
    """Parses raw EXIF into a flat dictionary for FTS indexing."""
    # Extract Sui parameters if they exist
    params_str = exif_json.get("parameters", "{}")
    try:
        params = json.loads(params_str) if isinstance(params_str, str) else params_str
    except:
        params = {}
    sui = params.get("sui_image_params", {})

    # Recursive helper for 'full_text' catch-all
    def flatten(x):
        if isinstance(x, dict): return " ".join(flatten(v) for v in x.values())
        if isinstance(x, list): return " ".join(flatten(i) for i in x)
        return str(x)

    return {
        "location_id": location_id,
        "path": path,
        "filename": filename,
        "prompt": sui.get("prompt"),
        "negative_prompt": sui.get("negativeprompt"),
        "model": sui.get("model"),
        "sampler": sui.get("sampler"),
        "scheduler": sui.get("scheduler"),
        "loras": str(sui.get("loras", "")),
        "upscaler": sui.get("upscaler"),
        "application": "SwarmUI" if "swarm_version" in sui else "Unknown",
        "full_text": flatten(exif_json)
    }

def build_fts_query(user_query: str):
    """Converts 'cat model:SDXL' into 'cat AND model:SDXL'."""
    if not user_query: return None
    mapping = {"PROMPT:": "prompt:", "NEG:": "negative_prompt:", "MODEL:": "model:", "APP:": "application:", "FOLDER:": "path:", "PATH:": "path:", "FILENAME:": "filename:"}
    try:
        parts = shlex.split(user_query)
    except:
        parts = user_query.split()

    terms = []
    for p in parts:
        upper_p = p.upper()
        for prefix, col in mapping.items():
            if upper_p.startswith(prefix):
                val = p[len(prefix):]
                if val.endswith('*'):
                    terms.append(f'{col}"{val[:-1]}"*')
                else:
                    terms.append(f'{col}"{val}"')
                break
        else:
            if p.endswith('*'):
                terms.append(f'"{p[:-1]}"*')
            else:
                terms.append(f'"{p}"')
    return " AND ".join(terms)