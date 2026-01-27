from fastapi import Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, not_, text, type_coerce, Boolean
from sqlalchemy.sql import expression
from models import ImageContent, Tag, ImagePath, Filter, ImageLocation
import database, json
import search_handler

def generate_image_search_filter(
    admin: bool = False,
    active_stages_json: str | None = None,
    db: Session = Depends(database.get_db),
    search_query: str | None = None
):
    """
    Generates a combined FTS query string and a SQLAlchemy filter clause based
    on the main search query and the active UI filters.

    This function:
    - Fetches all `Filter` definitions from the database.
    - Determines the active stage for each filter ('hide', 'show', 'show_only', 'disabled') based on user input.
    - For each active filter, it constructs a SQLAlchemy clause using FTS5 for `search_terms` and standard SQL for `tags`/`neg_tags`.
    - Combines these clauses with `AND` and `OR` logic based on the filter stages.
    - Applies global `admin_only` restrictions for non-admin users.

    Args:
        admin (bool): Whether the current user is an admin.
        active_stages_json (str | None): A JSON string representing the state of UI filters.
        db (Session): The database session.
        search_query (str | None): The raw search string from the main search bar.

    Returns:
        tuple[str | None, str | None, sqlalchemy.sql.expression.BinaryExpression]: A tuple containing
        the positive FTS query, the negative FTS query, and the SQLAlchemy filter clause.
    """

    # Fetch filters from the database
    db_filters = db.query(Filter).options(joinedload(Filter.tags), joinedload(Filter.neg_tags)).all()

    # Start with default stage 0 for all available filters.
    final_stages = {str(f.id): 0 for f in db_filters}

    # If the request includes active stages, merge them with the defaults.
    if active_stages_json and active_stages_json != 'null':
        try:
            user_provided_stages = json.loads(active_stages_json)
            final_stages.update(user_provided_stages)
        except json.JSONDecodeError:
            print(f"Warning: Could not decode active_stages_json: {active_stages_json}")
            # Proceed with just the defaults if JSON is invalid

    # Parts for the single, combined FTS query string
    fts_positive_parts = []
    fts_negative_parts = []

    # Clauses for the non-FTS SQLAlchemy filter
    non_fts_show_only_clauses = []
    non_fts_hide_clauses = []

    if search_query:
        main_fts_query = search_handler.build_fts_query(search_query)
        if main_fts_query:
            fts_positive_parts.append(main_fts_query)

    for f in db_filters:
        if f.admin_only and not admin:
            continue

        # Determine the active stage for this filter
        stage_index = final_stages.get(str(f.id)) # JSON keys are strings
        stage_map = {0: f.main_stage, 1: f.second_stage, 2: f.third_stage}

        # A filter is only processed if its determined stage is not 'disabled'.
        active_stage = stage_map.get(stage_index, 'disabled') # Default to 'disabled' if index is invalid
        if active_stage == 'disabled':
            continue

        # --- FTS Part ---
        if f.search_terms:
            fts_filter_query = search_handler.build_fts_query(f.search_terms)
            if fts_filter_query:
                if active_stage == 'show_only':
                    fts_positive_parts.append(fts_filter_query)
                elif active_stage == 'hide':
                    fts_negative_parts.append(fts_filter_query)

        # --- Non-FTS (Tags) Part ---
        # Only create a clause if there are tags involved in this filter
        if f.tags or f.neg_tags:
            positive_tag_criteria = expression.true()
            if f.tags:
                tag_ids = [tag.id for tag in f.tags]
                positive_tag_criteria = or_(ImageContent.tags.any(Tag.id.in_(tag_ids)), ImagePath.tags.any(Tag.id.in_(tag_ids)))

            negative_tag_criteria = expression.false()
            if f.neg_tags:
                neg_tag_ids = [tag.id for tag in f.neg_tags]
                negative_tag_criteria = or_(ImageContent.tags.any(Tag.id.in_(neg_tag_ids)), ImagePath.tags.any(Tag.id.in_(neg_tag_ids)))

            tag_core_logic = and_(positive_tag_criteria, not_(negative_tag_criteria))
            if active_stage == 'show_only':
                non_fts_show_only_clauses.append(tag_core_logic)
            elif active_stage == 'hide':
                non_fts_hide_clauses.append(not_(tag_core_logic))

    # --- Combine FTS parts ---
    fts_positive_query = None
    if fts_positive_parts:
        fts_positive_query = " OR ".join(f"({p})" for p in fts_positive_parts)

    fts_negative_query = None
    if fts_negative_parts:
        fts_negative_query = " OR ".join(f"({p})" for p in fts_negative_parts)

    # Apply global admin_only filters for ImagePath and Tags if `admin` is False
    global_admin_filter = expression.true()
    if not admin:
        global_admin_filter = and_(
            ImagePath.admin_only == False,
            not_(ImageContent.tags.any(Tag.admin_only == True)),
            not_(ImagePath.tags.any(Tag.admin_only == True)) # Also check folder tags
        )

    # --- Combine Non-FTS parts into a single SQLAlchemy clause ---
    final_non_fts_clause = global_admin_filter
    if non_fts_show_only_clauses:
        final_non_fts_clause = and_(final_non_fts_clause, or_(*non_fts_show_only_clauses))
    if non_fts_hide_clauses:
        final_non_fts_clause = and_(final_non_fts_clause, *non_fts_hide_clauses)

    return fts_positive_query, fts_negative_query, final_non_fts_clause