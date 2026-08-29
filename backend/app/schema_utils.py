"""Lightweight PostgreSQL schema checks used during application startup.

The API used to run unconditional ``ALTER TABLE ... IF NOT EXISTS`` statements
on every restart. PostgreSQL still needs a table lock for those DDL statements,
which can block behind normal application traffic and eventually hit Supabase's
statement timeout. These helpers let startup inspect the catalog first and only
run DDL when a table/column/index is genuinely missing.
"""

from sqlalchemy import text


def extension_exists(connection, extension_name: str) -> bool:
    return bool(
        connection.execute(
            text(
                """
                select exists (
                    select 1
                    from pg_extension
                    where extname = :extension_name
                )
                """
            ),
            {"extension_name": extension_name},
        ).scalar()
    )


def table_exists(connection, schema_name: str, table_name: str) -> bool:
    return bool(
        connection.execute(
            text(
                """
                select exists (
                    select 1
                    from information_schema.tables
                    where table_schema = :schema_name
                      and table_name = :table_name
                )
                """
            ),
            {"schema_name": schema_name, "table_name": table_name},
        ).scalar()
    )


def column_exists(connection, schema_name: str, table_name: str, column_name: str) -> bool:
    return bool(
        connection.execute(
            text(
                """
                select exists (
                    select 1
                    from information_schema.columns
                    where table_schema = :schema_name
                      and table_name = :table_name
                      and column_name = :column_name
                )
                """
            ),
            {
                "schema_name": schema_name,
                "table_name": table_name,
                "column_name": column_name,
            },
        ).scalar()
    )


def index_exists(connection, schema_name: str, index_name: str) -> bool:
    return bool(
        connection.execute(
            text(
                """
                select exists (
                    select 1
                    from pg_indexes
                    where schemaname = :schema_name
                      and indexname = :index_name
                )
                """
            ),
            {"schema_name": schema_name, "index_name": index_name},
        ).scalar()
    )
