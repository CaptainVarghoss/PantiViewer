import shlex, json
import models

def flatten_exif_to_fts(location_id, path, filename, exif_json, tags=""):
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
        "tags": tags,
        "stub": "1",
        "full_text": flatten(exif_json) + " " + tags
    }

def build_fts_query(user_query: str):
    if not user_query:
        return None

    mapping = {
        "PROMPT:": "prompt:", "NEG:": "negative_prompt:", 
        "MODEL:": "model:", "APP:": "application:", 
        "FOLDER:": "path:", "PATH:": "path:",
        "TAG:": "tags:",
        "FILENAME:": "filename:"
    }

    # Map symbols to FTS5 keywords
    symbols = {
        "|": "OR",
        "&": "AND",
        "!": "NOT"
    }
    
    # FTS5 Reserved Keywords (must be uppercase to be recognized as operators)
    fts_keywords = {"AND", "OR", "NOT", "NEAR"}

    try:
        # Using shlex to respect "quoted phrases"
        parts = shlex.split(user_query)
    except ValueError:
        # Fallback for unclosed quotes
        parts = user_query.split()

    terms = []
    for p in parts:
        # Normalize symbols to operators
        p_upper = p.upper()
        if p_upper in symbols:
            terms.append(symbols[p_upper])
            continue

        # Handle explicit Boolean Operators (fts_keywords)
        if p.upper() in fts_keywords:
            terms.append(p.upper())
            continue

        # Handle NEAR() syntax specifically. We skip quoting logic if it's a NEAR function.
        if p_upper.startswith("NEAR("):
            terms.append(p)
            continue

        # Handle Shorthand NOT (e.g., -cat)
        prefix_operator = ""
        clean_p = p
        if p.startswith('-') and len(p) > 1:
            prefix_operator = "NOT "
            clean_p = p[1:]

        #  Handle Column-Specific Searches (e.g., MODEL:v1*)
        target_col = ""
        upper_p = clean_p.upper()
        for prefix, col in mapping.items():
            if upper_p.startswith(prefix):
                target_col = col
                clean_p = clean_p[len(prefix):]
                break

        # Handle Prefix Wildcard (*)
        suffix_wildcard = ""
        if clean_p.endswith('*') and len(clean_p) > 1:
            suffix_wildcard = "*"
            clean_p = clean_p[:-1]

        assembled = f'{prefix_operator}{target_col}"{clean_p}"{suffix_wildcard}'
        terms.append(assembled)

    return " ".join(terms)

def get_active_filter_stages(db_filters: list[models.Filter], active_stages_json: str):
    """
    db_filters: Result from your db.query(models.Filter).all()
    active_stages_json: String like '{"1": 2, "5": 3}' from the frontend
    """
    try:
        # Parse frontend input: e.g., { "filter_id": stage_index }
        stage_map = json.loads(active_stages_json) if active_stages_json else {}
    except:
        stage_map = {}

    active_stages = []

    for f in db_filters:
        current_stage_idx = stage_map.get(str(f.id), 0)

        # Map the index to the actual action string stored in the DB
        if current_stage_idx == 0:
            action = f.main_stage
        elif current_stage_idx == 1:
            action = f.second_stage
        elif current_stage_idx == 2:
            action = f.third_stage
        else:
            action = "disabled"

        # Only include if the action is something that affects the query
        if action in ["hide", "show_only"]:
            # We attach the 'action' to the object temporarily so the 
            # expression builder knows what to do with it.
            f.current_action = action 
            active_stages.append(f)

    return active_stages


def get_final_fts_expression(user_query: str, active_configs: list[models.Filter]):
    """
    user_query: Raw search bar text
    active_configs: The hydrated list from get_active_filter_stages()
    Returns: query_string or None
    """
    # Build the base user search (e.g., "cat")
    base_fts = build_fts_query(user_query)
    
    hide_clauses = []
    show_only_clauses = []

    for f in active_configs:
        # Compile the filter's specific search terms
        filter_logic = build_fts_query(f.search_terms)
        
        # Combine with Positive Tags (Tags that trigger this filter)
        if f.tags:
            tag_str = " OR ".join([f'tags:"{t.name}"' for t in f.tags])
            filter_logic = f"({filter_logic} OR {tag_str})" if filter_logic else f"({tag_str})"

        # Wrap with Negative Tags (Protection logic: "Filter BUT NOT if tagged X")
        if f.neg_tags:
            neg_tag_str = " OR ".join([f'tags:"{t.name}"' for t in f.neg_tags])
            filter_logic = f"({filter_logic} NOT ({neg_tag_str}))"

        if not filter_logic:
            continue

        # Categorize based on the determined action
        if f.current_action == "hide":
            hide_clauses.append(filter_logic)
        elif f.current_action == "show_only":
            show_only_clauses.append(filter_logic)

    # Build Positive Query Components
    positive_parts = []
    if base_fts:
        positive_parts.append(f"({base_fts})")
    
    for c in show_only_clauses:
        positive_parts.append(f"({c})")

    # If no positive parts exist but we have exclusions, use the dummy anchor
    if not positive_parts and hide_clauses:
        positive_parts.append('stub:"1"')

    # Assemble Final Query
    if positive_parts:
        # We have a positive anchor (User query OR Show Only filters OR Dummy)
        final_query = " AND ".join(positive_parts)
        
        for c in hide_clauses:
            final_query = f"({final_query}) NOT ({c})"
        return final_query
        
    return None