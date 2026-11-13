"""v1.1 Step 5: write the SQL copy of the engine's one migration table (engine.py MIGRATE_BY_TYPE, V10_TYPE_TAGS,
MIGRATE_BY_TAG, SHAPE_TAGS) into supabase/migrations/20261115000000_v11_kinds.sql between its GENERATED markers.
tests_v11.py checks the SQL block equals this output, so the database, both engines and db.js hold one table.
usage (repo root): python3 supabase/gen_v11_kinds_sql.py [--check]"""
import os, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import engine as e

PATH = os.path.join(HERE, "supabase", "migrations", "20261115000000_v11_kinds.sql")
BEGIN, END = "-- BEGIN GENERATED (supabase/gen_v11_kinds_sql.py from engine.py)", "-- END GENERATED"
q = lambda s: "'" + s.replace("'", "''") + "'"


def block():
    L = [BEGIN,
         "-- (kind, shape) in v1.1 terms: a known type wins while the pitch still has that type's v1.0 tags; else the v1.0",
         "-- kind and tag; v1.1 kinds and tags pass through (engine.py migrate_pitch).",
         "create function private.pc_migrate_pitch(kind text, shape text, type text) returns text[]",
         "language sql immutable set search_path = '' as $$",
         "  select coalesce(",
         "    (select array[t.k2, t.s2] from (values"]
    rows = [f"      ({q(ty)}, {q(e.V10_TYPE_TAGS[ty][0])}, {q(e.V10_TYPE_TAGS[ty][1])}, {q(k)}, {q(s)})" for ty, (k, s) in e.MIGRATE_BY_TYPE.items()]
    L.append(",\n".join(rows))
    L.append("    ) as t(ty, k1, s1, k2, s2) where t.ty = type and t.k1 = kind and t.s1 = coalesce(shape, '')),")
    L.append("    (select array[g.k2, g.s2] from (values")
    rows = [f"      ({q(k1)}, {q(s1)}, {q(k2)}, {q(s2)})" for (k1, s1), (k2, s2) in e.MIGRATE_BY_TAG.items()]
    L.append(",\n".join(rows))
    L.append("    ) as g(k1, s1, k2, s2) where g.k1 = kind and g.s1 = coalesce(shape, '')),")
    L.append("    array[kind, coalesce(shape, '')])")
    L.append("$$;")
    L.append("-- the v1.1 tags of each kind (engine.py SHAPE_TAGS)")
    L.append("create function private.pc_shape_ok(kind text, shape text) returns boolean")
    L.append("language sql immutable set search_path = '' as $$")
    L.append("  select coalesce(shape, '') = any (case kind")
    for k, tags in e.SHAPE_TAGS.items():
        L.append(f"    when {q(k)} then array[{', '.join(q(t) for t in tags)}]")
    L.append("    else array[]::text[] end)")
    L.append("$$;")
    L.append(END)
    return "\n".join(L)


def main():
    src = open(PATH).read()
    a, b = src.index(BEGIN), src.index(END) + len(END)
    new = src[:a] + block() + src[b:]
    if "--check" in sys.argv:
        print("SQL migration table matches engine.py" if new == src else "SQL migration table DIFFERS from engine.py")
        sys.exit(0 if new == src else 1)
    open(PATH, "w").write(new)
    print("wrote", PATH)


if __name__ == "__main__":
    main()
