#!/usr/bin/env python3
"""Static and offline checks for the UCP Gateway skill bundle."""

import io
import json
import os
import re
import stat
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True

ROOT = Path.cwd()
TARGET_VERSION = "0.2.1"
TOOL_NAMES = [
    "register_ucp_profile",
    "get_ucp_profile",
    "shopping_product_search",
    "shopping_product_get",
    "shopping_cart_create",
    "shopping_cart_get",
    "shopping_cart_update",
    "shopping_cart_cancel",
    "shopping_checkout_create",
    "shopping_checkout_get",
    "shopping_checkout_update",
    "shopping_checkout_cancel",
]
OLD_ALIASES = [
    "shopping_search_products",
    "shopping_get_product",
    "shopping_create_cart",
    "shopping_get_cart",
    "shopping_update_cart",
    "shopping_cancel_cart",
    "shopping_create_checkout",
    "shopping_get_checkout",
    "shopping_update_checkout",
    "shopping_cancel_checkout",
]
EXPECTED_SCRIPTS = {
    "init": "python3 scripts/init_ucpgateway.py",
    "register": "python3 scripts/register_profile.py",
    "call": "python3 scripts/call_mcp.py",
    "check": "python3 scripts/check_skill.py && python3 scripts/init_ucpgateway.py --dry-run && python3 scripts/call_mcp.py --help",
}
EXPECTED_BIN = {
    "ucpgateway-init": "./scripts/init_ucpgateway.py",
    "ucpgateway-register": "./scripts/register_profile.py",
    "ucpgateway-call": "./scripts/call_mcp.py",
}
PRIVATE_FIELDS = {"d", "p", "q", "dp", "dq", "qi", "k"}
ERRORS = []


def fail(message):
    ERRORS.append(message)


def read_text(path):
    return path.read_text(encoding="utf-8")


def check_frontmatter(skill):
    match = re.match(r"^---\n([\s\S]*?)\n---\n", skill)
    if not match:
        fail("SKILL.md missing YAML frontmatter")
        return
    frontmatter = match.group(1)
    lines = [line.strip() for line in frontmatter.splitlines() if line.strip()]
    keys = [line.split(":", 1)[0] for line in lines]
    for required in ("name", "description"):
        if required not in keys:
            fail(f"frontmatter missing {required}")
    extra = [key for key in keys if key not in {"name", "description", "metadata"}]
    if extra:
        fail(f"frontmatter contains unsupported keys: {', '.join(extra)}")
    if re.search(r"\balways\b", frontmatter, flags=re.IGNORECASE):
        fail("frontmatter must not contain always")
    metadata_lines = [line for line in lines if line.startswith("metadata:")]
    if metadata_lines:
        allowed = re.compile(r'^metadata:\s*\{\s*"openclaw"\s*:\s*\{\s*"emoji"\s*:\s*"[^"]+"\s*\}\s*\}\s*$')
        if len(metadata_lines) != 1 or not allowed.match(metadata_lines[0]):
            fail("frontmatter metadata may only provide OpenClaw emoji metadata")


def check_skill_text(skill):
    for name in TOOL_NAMES:
        if name not in skill:
            fail(f"SKILL.md missing tool name {name}")
    if re.search(r"shopify_", skill, flags=re.IGNORECASE):
        fail("SKILL.md must not contain provider-specific aliases")
    for alias in OLD_ALIASES:
        if alias in skill:
            fail(f"SKILL.md must not contain removed alias {alias}")


def check_package(pkg):
    if pkg.get("version") != TARGET_VERSION:
        fail(f"package.json version must be {TARGET_VERSION}")
    if pkg.get("type") == "module":
        fail("package.json should not declare ESM module mode after the Python rewrite")
    scripts = pkg.get("scripts") or {}
    for name, expected in EXPECTED_SCRIPTS.items():
        if scripts.get(name) != expected:
            fail(f"package.json scripts.{name} must be {expected!r}")
    for name, command in scripts.items():
        if "node" in command.split():
            fail(f"package.json scripts.{name} must not invoke the Node runtime")
    bins = pkg.get("bin") or {}
    if bins != EXPECTED_BIN:
        fail("package.json bin entries must point to the Python helper scripts")
    for target in bins.values():
        target_path = ROOT / target.lstrip("./")
        if target_path.suffix != ".py":
            fail(f"bin target {target} must be a Python script")
            continue
        if not target_path.exists():
            fail(f"bin target {target} does not exist")
            continue
        first_line = read_text(target_path).splitlines()[0] if read_text(target_path).splitlines() else ""
        if first_line != "#!/usr/bin/env python3":
            fail(f"bin target {target} must start with a python3 shebang")
        if os.name == "posix" and not os.access(target_path, os.X_OK):
            fail(f"bin target {target} should be executable")


def check_python_scripts():
    scripts_dir = ROOT / "scripts"
    legacy_suffix = "." + "mjs"
    legacy_files = sorted(path.name for path in scripts_dir.iterdir() if path.suffix == legacy_suffix)
    if legacy_files:
        fail(f"legacy helper scripts remain in scripts/: {', '.join(legacy_files)}")
    expected = {"init_ucpgateway.py", "register_profile.py", "call_mcp.py", "check_skill.py"}
    actual = {path.name for path in scripts_dir.glob("*.py")}
    missing = sorted(expected - actual)
    if missing:
        fail(f"missing Python helper script(s): {', '.join(missing)}")
    for path in sorted(scripts_dir.glob("*.py")):
        try:
            compile(read_text(path), str(path), "exec")
        except SyntaxError as exc:
            fail(f"{path.relative_to(ROOT)} does not compile: {exc.msg}")
    # Python bytecode caches must never ship in the ClawHub/npm tarball.
    if (scripts_dir / "__pycache__").exists():
        fail("scripts/__pycache__ exists; remove it so it is not packaged")
    stray_bytecode = sorted(
        path.name
        for path in scripts_dir.rglob("*")
        if path.suffix in {".pyc", ".pyo"}
    )
    if stray_bytecode:
        fail(f"compiled Python bytecode must not ship: {', '.join(stray_bytecode)}")


def check_version_fallback():
    register_script = read_text(ROOT / "scripts" / "register_profile.py")
    match = re.search(r'PACKAGE_VERSION\s*=\s*"([^"]+)"', register_script)
    if not match:
        fail("register_profile.py missing PACKAGE_VERSION fallback")
    elif match.group(1) != TARGET_VERSION:
        fail(f"register_profile.py fallback {match.group(1)} does not match package version {TARGET_VERSION}")


def check_examples():
    examples_dir = ROOT / "examples"
    for path in sorted(examples_dir.iterdir()):
        if not (path.name.endswith(".json") or path.name.endswith(".json.example")):
            continue
        try:
            json.loads(read_text(path))
        except json.JSONDecodeError as exc:
            fail(f"examples/{path.name} is not valid JSON: {exc.msg}")


def check_no_stale_runtime_refs():
    legacy_token = "." + "mjs"
    old_command_token = "node " + "scripts/"
    targets = [ROOT / "package.json", ROOT / "README.md", ROOT / "SKILL.md"]
    targets.extend(sorted((ROOT / "scripts").glob("*.py")))
    targets.extend(sorted((ROOT / "examples").iterdir()))
    for path in targets:
        if not path.is_file():
            continue
        text = read_text(path)
        if legacy_token in text:
            fail(f"{path.relative_to(ROOT)} contains a stale legacy script extension reference")
        if old_command_token in text:
            fail(f"{path.relative_to(ROOT)} contains a stale Node helper command")


def assert_file_mode(path, expected_mode):
    if os.name != "posix":
        return
    actual = stat.S_IMODE(path.stat().st_mode)
    if actual != expected_mode:
        fail(f"{path.name} mode {oct(actual)} should be {oct(expected_mode)}")


def check_init_tempdir_behaviour():
    try:
        import init_ucpgateway as init_script
    except Exception as exc:  # noqa: BLE001 - report concise check failure
        fail(f"could not import init_ucpgateway.py for offline tests: {exc}")
        return

    try:
        with tempfile.TemporaryDirectory() as tmp:
            temp_root = Path(tmp)
            out = io.StringIO()
            err = io.StringIO()
            init_script.run(["--dry-run"], cwd=temp_root, stdout=out, stderr=err)
            if (temp_root / ".ucpgateway").exists():
                fail("init dry-run must not create ./.ucpgateway")

            init_script.run([], cwd=temp_root, stdout=io.StringIO(), stderr=io.StringIO())
            state_dir = temp_root / ".ucpgateway"
            private_path = state_dir / "private_key.jwk"
            public_path = state_dir / "public_key.jwk"
            if not private_path.exists() or not public_path.exists():
                fail("init must create private_key.jwk and public_key.jwk when both are missing")
                return
            assert_file_mode(private_path, 0o600)
            assert_file_mode(public_path, 0o644)
            private_jwk = json.loads(private_path.read_text(encoding="utf-8"))
            public_jwk = json.loads(public_path.read_text(encoding="utf-8"))
            if PRIVATE_FIELDS.intersection(public_jwk):
                fail("public_key.jwk must not contain private JWK fields")
            derived_public = init_script.derive_public_from_private(private_jwk)
            if init_script.validate_public_jwk(public_jwk) != init_script.validate_public_jwk(derived_public):
                fail("generated public_key.jwk must match private_key.jwk")

            public_path.unlink()
            init_script.run([], cwd=temp_root, stdout=io.StringIO(), stderr=io.StringIO())
            if not public_path.exists():
                fail("private-only state must derive public_key.jwk")

            private_path.unlink()
            try:
                init_script.run([], cwd=temp_root, stdout=io.StringIO(), stderr=io.StringIO())
            except init_script.UcpInitError:
                pass
            else:
                fail("public-only state must fail unless --public-only is supplied")
            init_script.run(["--public-only"], cwd=temp_root, stdout=io.StringIO(), stderr=io.StringIO())

        with tempfile.TemporaryDirectory() as tmp:
            temp_root = Path(tmp)
            init_script.run([], cwd=temp_root, stdout=io.StringIO(), stderr=io.StringIO())
            state_dir = temp_root / ".ucpgateway"
            public_path = state_dir / "public_key.jwk"
            _, other_public = init_script.generate_keypair()
            init_script.write_json(public_path, other_public, 0o644)
            try:
                init_script.run([], cwd=temp_root, stdout=io.StringIO(), stderr=io.StringIO())
            except init_script.UcpInitError:
                pass
            else:
                fail("mismatched private/public key files must fail")

        with tempfile.TemporaryDirectory() as tmp:
            temp_root = Path(tmp)
            init_script.run([], cwd=temp_root, stdout=io.StringIO(), stderr=io.StringIO())
            private_path = temp_root / ".ucpgateway" / "private_key.jwk"
            before = json.loads(private_path.read_text(encoding="utf-8"))["d"]
            init_script.run(["--force-rotate"], cwd=temp_root, stdout=io.StringIO(), stderr=io.StringIO())
            after = json.loads(private_path.read_text(encoding="utf-8"))["d"]
            if before == after:
                fail("--force-rotate must replace the private key")

        with tempfile.TemporaryDirectory() as tmp:
            temp_root = Path(tmp)
            init_script.run(["--legacy-draft"], cwd=temp_root, stdout=io.StringIO(), stderr=io.StringIO())
            draft = json.loads((temp_root / ".ucpgateway" / "profile.draft.json").read_text(encoding="utf-8"))
            signing_key = draft["signing_keys"][0]
            if PRIVATE_FIELDS.intersection(signing_key):
                fail("profile.draft.json signing key must not contain private fields")
    except Exception as exc:  # noqa: BLE001 - continue with concise validation failure
        fail(f"init_ucpgateway.py offline behaviour test failed: {exc}")


def main():
    try:
        skill = read_text(ROOT / "SKILL.md")
        pkg = json.loads(read_text(ROOT / "package.json"))
    except Exception as exc:  # noqa: BLE001 - concise validation failure
        print(f"check-skill: {exc}", file=sys.stderr)
        return 1

    check_frontmatter(skill)
    check_skill_text(skill)
    check_package(pkg)
    check_python_scripts()
    check_version_fallback()
    check_examples()
    check_no_stale_runtime_refs()
    check_init_tempdir_behaviour()

    if ERRORS:
        for message in ERRORS:
            print(f"check-skill: {message}", file=sys.stderr)
        return 1
    print(f"check-skill: ok ({pkg.get('name')}@{pkg.get('version')})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
