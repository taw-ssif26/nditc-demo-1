from alembic import context
from app.models import Base, engine

target = Base.metadata

def run():
    with engine.connect() as c:
        context.configure(connection=c, target_metadata=target, compare_type=True, render_as_batch=engine.dialect.name == "sqlite")
        with context.begin_transaction():
            context.run_migrations()

run()
