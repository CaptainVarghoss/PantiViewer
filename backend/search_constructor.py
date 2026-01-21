import re
from fastapi import Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, not_
from sqlalchemy.sql import expression
from models import ImageContent, Tag, ImagePath, Filter, ImageLocation
import database, json

# --- Token Definitions for Lexical Analysis ---
# These constants define the types of tokens our tokenizer will recognize.
TOKEN_TYPE_WORD = 'WORD'             # An unquoted word (e.g., "photo")
TOKEN_TYPE_PHRASE = 'PHRASE'         # A quoted phrase (e.g., "My vacation")
TOKEN_TYPE_AND = 'AND'               # Logical AND operator (e.g., "AND", "&")
TOKEN_TYPE_OR = 'OR'                 # Logical OR operator (e.g., "OR", "|")
TOKEN_TYPE_NOT = 'NOT'               # Logical NOT operator (e.g., "NOT", "!")
TOKEN_TYPE_LPAREN = 'LPAREN'         # Left parenthesis (e.g., "(")
TOKEN_TYPE_RPAREN = 'RPAREN'         # Right parenthesis (e.g., ")")
TOKEN_TYPE_KEYWORD_TAG = 'KEYWORD_TAG' # TAG keyword (e.g., "TAG:")
TOKEN_TYPE_KEYWORD_FOLDER = 'KEYWORD_FOLDER' # FOLDER keyword (e.g., "FOLDER:")

class Token:
    """
    Represents a single token identified during the tokenization process.
    Each token has a type and an optional value.
    """
    def __init__(self, type, value=None):
        self.type = type
        self.value = value

    def __repr__(self):
        # Provides a clear string representation for debugging.
        return f"Token({self.type}{', ' + repr(self.value) if self.value is not None else ''})"

def tokenize(search_string: str):
    """
    Tokenizes the input search string into a list of Token objects.
    This function uses regular expressions to identify and extract:
    - Quoted phrases (single or double quotes)
    - Logical operators (AND, OR, NOT and their symbolic counterparts &, |, !)
    - Parentheses
    - Special keywords (TAG:, FOLDER:)
    - Regular words (any other non-special character sequence)

    Args:
        search_string (str): The raw input string from the user's search query.

    Returns:
        list[Token]: A list of Token objects representing the parsed search query.
    """
    tokens = []
    # The regex pattern is designed to capture tokens in a specific order:
    # Most specific patterns (like quoted phrases) first, then operators, then keywords, then general words.
    token_patterns = re.compile(r"""
        ("(?P<dquote_phrase>[^"]*)"        # 1. Double quoted phrase: captures content between ""
        |'(?P<squote_phrase>[^']*)'        # 2. Single quoted phrase: captures content between ''
        |\b(?P<and_word>AND)\b             # 3. 'AND' word (with word boundaries)
        |(?P<and_symbol>&)                 # 4. '&' symbol for AND
        |\b(?P<or_word>OR)\b               # 5. 'OR' word (with word boundaries)
        |(?P<or_symbol>\|)                 # 6. '|' symbol for OR
        |\b(?P<not_word>NOT)\b             # 7. 'NOT' word (with word boundaries)
        |(?P<not_symbol>!)                 # 8. '!' symbol for NOT
        |(?P<lparen>\()                    # 9. Left parenthesis
        |(?P<rparen>\))                    # 10. Right parenthesis
        |(?P<tag_keyword>TAG):             # 11. 'TAG:' keyword (case-insensitive due to re.IGNORECASE)
        |(?P<folder_keyword>FOLDER):       # 12. 'FOLDER:' keyword (case-insensitive)
        |(?P<word>[^\s"'\(\)&|!:]+)        # 13. Any other word (sequence of non-whitespace, non-special chars)
    )""", re.VERBOSE | re.IGNORECASE) # VERBOSE allows comments in regex, IGNORECASE makes patterns case-insensitive

    # Iterate through all matches found in the search string
    for match in token_patterns.finditer(search_string):
        if match.group('dquote_phrase') is not None:
            tokens.append(Token(TOKEN_TYPE_PHRASE, match.group('dquote_phrase')))
        elif match.group('squote_phrase') is not None:
            tokens.append(Token(TOKEN_TYPE_PHRASE, match.group('squote_phrase')))
        elif match.group('and_word') is not None or match.group('and_symbol') is not None:
            tokens.append(Token(TOKEN_TYPE_AND))
        elif match.group('or_word') is not None or match.group('or_symbol') is not None:
            tokens.append(Token(TOKEN_TYPE_OR))
        elif match.group('not_word') is not None or match.group('not_symbol') is not None:
            tokens.append(Token(TOKEN_TYPE_NOT))
        elif match.group('lparen') is not None:
            tokens.append(Token(TOKEN_TYPE_LPAREN))
        elif match.group('rparen') is not None:
            tokens.append(Token(TOKEN_TYPE_RPAREN))
        elif match.group('tag_keyword') is not None:
            tokens.append(Token(TOKEN_TYPE_KEYWORD_TAG))
        elif match.group('folder_keyword') is not None:
            tokens.append(Token(TOKEN_TYPE_KEYWORD_FOLDER))
        elif match.group('word') is not None:
            tokens.append(Token(TOKEN_TYPE_WORD, match.group('word')))
    return tokens

# --- Abstract Syntax Tree (AST) Node Definitions ---
# These classes define the structure of the parsed search query.

class Node:
    """Base class for all Abstract Syntax Tree nodes."""
    pass

class BinaryOpNode(Node):
    """Represents a binary operation, such as AND or OR, with two operands."""
    def __init__(self, op_type, left, right):
        self.op_type = op_type # Type of operator (e.g., TOKEN_TYPE_AND, TOKEN_TYPE_OR)
        self.left = left       # Left operand (another Node)
        self.right = right     # Right operand (another Node)

    def __repr__(self):
        return f"({repr(self.left)} {self.op_type} {repr(self.right)})"

class UnaryOpNode(Node):
    """Represents a unary operation, such as NOT, with a single operand."""
    def __init__(self, op_type, operand):
        self.op_type = op_type # Type of operator (e.g., TOKEN_TYPE_NOT)
        self.operand = operand # The single operand (another Node)

    def __repr__(self):
        return f"({self.op_type} {repr(self.operand)})"

class TermNode(Node):
    """
    Represents a fundamental search unit, which can be a word, a phrase,
    or a value associated with a keyword (TAG:, FOLDER:).
    The `value_original_type` tracks if the original input was quoted or not,
    which determines if an exact or partial match is required for keywords.
    """
    def __init__(self, term_type, value, value_original_type=None):
        self.term_type = term_type             # The kind of term (e.g., TOKEN_TYPE_WORD, KEYWORD_TAG)
        self.value = value                     # The actual string content to search for
        self.value_original_type = value_original_type # Original token type of the value part (WORD or PHRASE)

    def __repr__(self):
        # Provides a more descriptive representation for debugging the AST.
        if self.term_type in [TOKEN_TYPE_WORD, TOKEN_TYPE_PHRASE]:
            return f"Term({self.term_type}:'{self.value}')"
        return f"Term({self.term_type}:'{self.value}' ({self.value_original_type}))"


# --- Recursive Descent Parser ---
# This parser builds the AST from the tokens, respecting operator precedence.

class Parser:
    """
    A recursive descent parser that takes a list of tokens and constructs
    an Abstract Syntax Tree (AST). It correctly handles operator precedence
    (NOT > AND > OR) and implicit AND operations.
    """
    def __init__(self, tokens):
        self.tokens = tokens
        self.current_token_index = 0 # Pointer to the current token being processed

    def peek(self):
        """Returns the current token without advancing the index. Returns None if at end."""
        if self.current_token_index < len(self.tokens):
            return self.tokens[self.current_token_index]
        return None

    def consume(self, expected_type=None):
        """
        Consumes the current token and advances the index.
        Optionally, it verifies if the consumed token matches an `expected_type`.

        Args:
            expected_type (str, optional): The expected type of the token.
                                           If provided, a SyntaxError is raised
                                           if the actual type does not match.

        Returns:
            Token: The consumed token.

        Raises:
            SyntaxError: If at the end of input or if the token type does not match `expected_type`.
        """
        if self.current_token_index < len(self.tokens):
            token = self.tokens[self.current_token_index]
            if expected_type and token.type != expected_type:
                raise SyntaxError(f"Expected token of type {expected_type}, got {token.type} at index {self.current_token_index}")
            self.current_token_index += 1
            return token
        raise SyntaxError("Unexpected end of input: ran out of tokens prematurely.")

    def parse(self):
        """
        Main entry point for parsing. Parses the entire token list and returns
        the root node of the constructed AST.

        Raises:
            SyntaxError: If there are unparsed tokens at the end of input,
                         indicating a syntax error.
        """
        ast = self.parse_expression() # Start parsing from the lowest precedence (expressions)
        if self.current_token_index < len(self.tokens):
            # If tokens remain after parsing the main expression, it's a syntax error.
            raise SyntaxError(f"Unexpected tokens at end of input: {self.tokens[self.current_token_index:]}")
        return ast

    def parse_expression(self):
        """
        Parses an expression, handling `OR` operators.
        This function represents the lowest level of precedence (OR).
        """
        node = self.parse_term() # Delegate to the next higher precedence level (AND)
        while self.peek() and self.peek().type == TOKEN_TYPE_OR:
            op_token = self.consume() # Consume the 'OR' operator
            right_node = self.parse_term() # Parse the right-hand side operand
            node = BinaryOpNode(op_token.type, node, right_node) # Combine into an OR node
        return node

    def parse_term(self):
        """
        Parses a term, handling explicit `AND` operators and implicit `AND`s.
        This function represents the mid-level of precedence (AND).
        """
        node = self.parse_factor() # Delegate to the next higher precedence level (NOT)
        while self.peek() and self.peek().type not in [TOKEN_TYPE_OR, TOKEN_TYPE_RPAREN]:
            # Check if the next token is an explicit 'AND' operator
            if self.peek().type == TOKEN_TYPE_AND:
                self.consume(TOKEN_TYPE_AND) # Consume the explicit 'AND'
            # Check if the next token is one that can start a new primary expression.
            # If so, and no explicit operator was found, it implies an implicit AND.
            elif self.peek().type in [TOKEN_TYPE_WORD, TOKEN_TYPE_PHRASE,
                                      TOKEN_TYPE_KEYWORD_TAG, TOKEN_TYPE_KEYWORD_FOLDER,
                                      TOKEN_TYPE_LPAREN, TOKEN_TYPE_NOT]:
                # This is an implicit AND scenario; do not consume a token here.
                # parse_factor will consume the next primary token.
                pass
            else:
                # The next token is not an operator and does not start a primary,
                # so stop processing this term.
                break

            right_node = self.parse_factor() # Parse the right-hand side operand for the AND
            node = BinaryOpNode(TOKEN_TYPE_AND, node, right_node) # Combine into an AND node
        return node

    def parse_factor(self):
        """
        Parses a factor, handling `NOT` operators.
        This function represents the highest level of precedence (NOT).
        """
        not_tokens = []
        # Collect all leading 'NOT' operators for this factor.
        while self.peek() and self.peek().type == TOKEN_TYPE_NOT:
            not_tokens.append(self.consume(TOKEN_TYPE_NOT))

        node = self.parse_primary() # Delegate to the base unit of an expression

        # Apply collected 'NOT' operations in reverse order (outermost NOT first).
        for _ in reversed(not_tokens):
            node = UnaryOpNode(TOKEN_TYPE_NOT, node)
        return node

    def parse_primary(self):
        """
        Parses the most basic units of an expression:
        - Parenthesized expressions (e.g., "(term OR term)")
        - Simple words
        - Quoted phrases
        - Keyword expressions (e.g., "TAG:value", "FOLDER:value")
        """
        token = self.peek()
        if not token:
            raise SyntaxError("Unexpected end of input: expected a primary expression.")

        if token.type == TOKEN_TYPE_LPAREN:
            self.consume(TOKEN_TYPE_LPAREN)  # Consume '('
            node = self.parse_expression()    # Recursively parse the expression inside parentheses
            self.consume(TOKEN_TYPE_RPAREN)  # Consume ')'
            return node
        elif token.type in [TOKEN_TYPE_WORD, TOKEN_TYPE_PHRASE]:
            self.consume() # Consume the word or phrase token
            # For standalone words/phrases, their "original type" is their own type.
            return TermNode(token.type, token.value, token.type)
        elif token.type == TOKEN_TYPE_KEYWORD_TAG:
            self.consume(TOKEN_TYPE_KEYWORD_TAG) # Consume 'TAG:'
            # Expect a word or a quoted phrase as the value for the TAG keyword.
            value_token = self.peek()
            if not value_token or value_token.type not in [TOKEN_TYPE_WORD, TOKEN_TYPE_PHRASE]:
                raise SyntaxError(f"Expected word or phrase after TAG:, got {value_token.type if value_token else 'nothing'} at index {self.current_token_index}")
            self.consume() # Consume the tag value token
            # Store the keyword type, its value, and the original type of that value (WORD or PHRASE).
            return TermNode(TOKEN_TYPE_KEYWORD_TAG, value_token.value, value_token.type)
        elif token.type == TOKEN_TYPE_KEYWORD_FOLDER:
            self.consume(TOKEN_TYPE_KEYWORD_FOLDER) # Consume 'FOLDER:'
            # Expect a word or a quoted phrase as the value for the FOLDER keyword.
            value_token = self.peek()
            if not value_token or value_token.type not in [TOKEN_TYPE_WORD, TOKEN_TYPE_PHRASE]:
                raise SyntaxError(f"Expected word or phrase after FOLDER:, got {value_token.type if value_token else 'nothing'} at index {self.current_token_index}")
            self.consume() # Consume the folder value token
            # Store the keyword type, its value, and the original type of that value (WORD or PHRASE).
            return TermNode(TOKEN_TYPE_KEYWORD_FOLDER, value_token.value, value_token.type)
        else:
            # If an unexpected token is encountered, it's a syntax error.
            raise SyntaxError(f"Unexpected token type: {token.type} with value '{token.value}' at index {self.current_token_index}")


# --- SQLAlchemy Query Filter Builder ---
# This component translates the AST into SQLAlchemy filter expressions.

def build_sqlalchemy_filter(node: Node, ImageContent, Tag, ImageLocation):
    """
    Recursively traverses the Abstract Syntax Tree (AST) and translates each node
    into a corresponding SQLAlchemy filter clause.

    Args:
        node (Node): The current AST node being processed.
        ImageContent: The SQLAlchemy ImageContent model class.
        Tag: The SQLAlchemy Tag model class.
        ImageLocation: The SQLAlchemy ImageLocation model class.

    Returns:
        sqlalchemy.sql.expression.BinaryExpression: A SQLAlchemy filter clause
            (e.g., and_(), or_(), not_(), or individual column expressions).
    """
    if isinstance(node, BinaryOpNode):
        # For binary operators (AND, OR), recursively build filters for both sides
        # and combine them using SQLAlchemy's `and_` or `or_`.
        left_filter = build_sqlalchemy_filter(node.left, ImageContent, Tag, ImageLocation)
        right_filter = build_sqlalchemy_filter(node.right, ImageContent, Tag, ImageLocation)
        if node.op_type == TOKEN_TYPE_AND:
            return and_(left_filter, right_filter)
        elif node.op_type == TOKEN_TYPE_OR:
            return or_(left_filter, right_filter)
    elif isinstance(node, UnaryOpNode):
        # For unary operators (NOT), recursively build the filter for the operand
        # and apply SQLAlchemy's `not_`.
        operand_filter = build_sqlalchemy_filter(node.operand, ImageContent, Tag, ImageLocation)
        if node.op_type == TOKEN_TYPE_NOT:
            return not_(operand_filter)
    elif isinstance(node, TermNode):
        search_term = node.value

        # Define how to search based on the term's type and original input style (quoted vs. unquoted).
        if node.term_type == TOKEN_TYPE_PHRASE:
            # If it's a standalone quoted phrase (e.g., "cat"), search for it as a whole word
            # across exif_data, folder, filename, and tag names.
            # Switched to ilike for performance and stability (prevents segfaults in some DB drivers).
            term_pattern = f"%{search_term}%"
            meta_filter = ImageContent.exif_data.ilike(term_pattern)
            folder_filter = ImageLocation.path.ilike(term_pattern)
            filename_filter = ImageLocation.filename.ilike(term_pattern)
            tag_filter = ImageContent.tags.any(Tag.name.ilike(term_pattern))
            return or_(meta_filter, folder_filter, filename_filter, tag_filter)

        elif node.term_type == TOKEN_TYPE_WORD:
            # If it's a standalone unquoted word (e.g., "cat"), search for it
            # partially (contains) across exif_data, folder, filename, and tag names.
            meta_filter = ImageContent.exif_data.ilike(f"%{search_term}%")
            folder_filter = ImageLocation.path.ilike(f"%{search_term}%")
            filename_filter = ImageLocation.filename.ilike(f"%{search_term}%")
            tag_filter = ImageContent.tags.any(Tag.name.ilike(f"%{search_term}%"))
            return or_(meta_filter, folder_filter, filename_filter, tag_filter)

        elif node.term_type == TOKEN_TYPE_KEYWORD_TAG:
            # For the 'TAG:' keyword:
            # If the value was originally a quoted phrase (e.g., TAG:"nature photography"),
            # perform an exact match on the Tag name.
            if node.value_original_type == TOKEN_TYPE_PHRASE:
                return ImageContent.tags.any(Tag.name == search_term) # Exact tag name match
            else: # If the value was an unquoted word (e.g., TAG:landscape)
                # Perform a partial (contains) match on the Tag name.
                return ImageContent.tags.any(Tag.name.ilike(f"%{search_term}%")) # Partial tag name match

        elif node.term_type == TOKEN_TYPE_KEYWORD_FOLDER:
            # For the 'FOLDER:' keyword:
            if node.value_original_type == TOKEN_TYPE_PHRASE:
                # If quoted, search for the term as a whole word on EITHER the full path OR the short_name.
                term_pattern = f"%{search_term}%"
                return or_(
                    ImageLocation.path.ilike(term_pattern),
                    ImageLocation.path.in_(
                        expression.select(ImagePath.path).where(
                            ImagePath.short_name.ilike(search_term)
                        )
                    )
                )
            else: # If the value was an unquoted word (e.g., FOLDER:documents)
                # If unquoted, perform a partial match on EITHER the full path OR the short_name.
                return or_(
                    ImageLocation.path.ilike(f"%{search_term}%"),
                    ImageLocation.path.in_(
                        expression.select(ImagePath.path).where(ImagePath.short_name.ilike(f"%{search_term}%"))
                    )
                )
    # If for any reason an unexpected node type is encountered, or for an effectively empty query,
    # return `expression.true()`, which means this filter clause won't restrict results.
    return expression.true()


def generate_image_search_filter(
    search_terms: str,
    admin: bool = False,
    active_stages_json: str | None = None,
    db: Session = Depends(database.get_db)
):
    """
    ... (docstring)
    Parses a complex search string and generates a SQLAlchemy query filter
    that can be applied to an Image query.

    This function supports:
    - Logical operators: `AND`, `OR`, `NOT` (and their symbolic counterparts `&`, `|`, `!`)
    - Specific keywords: `TAG:` and `FOLDER:` for precise granular searching on respective columns.
    - Exact phrase matches denoted by single or double quotes (e.g., `"my photos"`, `'old documents'`).
      For keywords, quotes enforce exact matches on the keyword's value.
    - Partial word matches for unquoted terms.
    - Searches across `ImageModel.meta`, `ImageModel.folder`, and `ImageModel.tags_relationship`
      (which queries `TagModel.name`).
    - Applies filters defined in the `Filter` table, respecting `admin_only` and the active stage
      ('hide', 'show', 'show_only').

    Args:
        search_terms (str): The search query string provided by the user.
        ImageModel (Type[Image]): The SQLAlchemy Image model class (e.g., `from .models import Image`).
        TagModel (Type[Tag]): The SQLAlchemy Tag model class (e.g., `from .models import Tag`).

    Returns:
        sqlalchemy.sql.expression.BinaryExpression: A SQLAlchemy filter clause
            that can be used directly with `.filter()` on a query (e.g., `session.query(Image).filter(filter_clause)`).
            Returns `expression.true()` if the `search_terms` string is empty or only whitespace,
            meaning no filter is applied (all results returned).
            Returns `expression.false()` if there is a syntax error in the `search_terms`,
            meaning no results will be returned.
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

    # This will hold clauses for 'hide' filters.
    hide_filter_clauses = []
    # This will hold the final filter clauses for each 'show_only' filter
    show_only_clauses = []

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

        # --- Build the positive and negative criteria for this filter ---
        positive_criteria_parts = []
        negative_criteria = expression.false() # An image matches the negative criteria if it has ANY of the neg_tags

        # Positive: search_terms
        if f.search_terms:
            try:
                tokens = tokenize(f.search_terms)
                if tokens:
                    parser = Parser(tokens)
                    ast = parser.parse()
                    positive_criteria_parts.append(build_sqlalchemy_filter(ast, ImageContent, Tag, ImageLocation))
            except SyntaxError:
                # Ignore malformed search_terms in a filter
                pass

        # Positive: tags
        if f.tags:
            tag_ids = [tag.id for tag in f.tags]
            # An image matches if its own tags OR its folder's tags are in the list
            positive_criteria_parts.append(or_(ImageContent.tags.any(Tag.id.in_(tag_ids)), ImagePath.tags.any(Tag.id.in_(tag_ids))))

        # Negative: neg_tags
        if f.neg_tags:
            neg_tag_ids = [tag.id for tag in f.neg_tags]
            # An image is excluded if its own tags OR its folder's tags are in the list
            negative_criteria = or_(ImageContent.tags.any(Tag.id.in_(neg_tag_ids)), ImagePath.tags.any(Tag.id.in_(neg_tag_ids)))

        # Combine all positive criteria with OR. If no positive criteria, default to true() so negative criteria can still be applied.
        positive_criteria = or_(*positive_criteria_parts) if positive_criteria_parts else expression.true()

        # --- Apply logic based on the active stage ---
        # The core logic for a filter is "matches positive criteria AND does NOT match negative criteria"
        filter_core_logic = and_(positive_criteria, not_(negative_criteria))

        if active_stage == 'hide':
            # HIDE: Exclude images that match the core logic.
            # This means we want `not(filter_core_logic)`
            hide_filter_clauses.append(not_(filter_core_logic))
        elif active_stage == 'show_only':
            # SHOW_ONLY: Results MUST match the core logic.
            # We collect these and will combine them with OR later.
            show_only_clauses.append(filter_core_logic)
        elif active_stage == 'show':
            # SHOW: This filter has no effect on the query.
            pass

    # Apply global admin_only filters for ImagePath and Tags if `admin` is False
    global_admin_filter = expression.true() # Starts as true
    if not admin:
        global_admin_filter = and_(
            ImagePath.admin_only == False,
            not_(ImageContent.tags.any(Tag.admin_only == True)),
            not_(ImagePath.tags.any(Tag.admin_only == True)) # Also check folder tags
        )

    ast_filter = expression.true()
    if search_terms:

        try:
            tokens = tokenize(search_terms)
            if tokens:
                parser = Parser(tokens)
                ast = parser.parse()
                ast_filter = build_sqlalchemy_filter(ast, ImageContent, Tag, ImageLocation)
            # else: If tokens is empty (e.g. from "   "), ast_filter remains true()
        except SyntaxError as e:
            # If a syntax error occurs during parsing, print it and return a filter that yields no results.
            print(f"Search query parsing error: {e}")
            return expression.false()

    # Start with the user's search query and global admin restrictions.
    final_filter_clause = and_(ast_filter, global_admin_filter)

    # If there are any 'show_only' filters active, the results must match AT LEAST ONE of them.
    if show_only_clauses:
        final_filter_clause = and_(final_filter_clause, or_(*show_only_clauses))

    # Apply all 'hide' filter clauses
    final_filter_clause = and_(final_filter_clause, *hide_filter_clauses)

    return final_filter_clause