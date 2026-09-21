"""Shared SurrealQL ORDER BY validation rejects query injection."""
import pytest

from open_notebook.domain.base import ObjectModel
from open_notebook.exceptions import InvalidInputError


class TestValidateOrderBy:
    @pytest.mark.parametrize(
        "clause,expected",
        [
            ("provider", "provider"),
            ("provider, created", "provider, created"),
            ("created DESC", "created desc"),
            ("provider asc, created desc", "provider asc, created desc"),
        ],
    )
    def test_accepts_and_normalizes_valid_clauses(self, clause, expected):
        assert ObjectModel._validate_order_by(clause) == expected

    @pytest.mark.parametrize(
        "clause",
        [
            "field; DROP TABLE credential",
            "provider, created; REMOVE TABLE credential",
            "provider) FETCH (SELECT * FROM credential",
            "created LIMIT 1",
            "provider desc extra",
            "",
        ],
    )
    def test_rejects_injection_and_malformed_clauses(self, clause):
        with pytest.raises(InvalidInputError):
            ObjectModel._validate_order_by(clause)
