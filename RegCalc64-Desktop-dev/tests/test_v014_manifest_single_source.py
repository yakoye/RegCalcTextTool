from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
cmake = (ROOT / 'CMakeLists.txt').read_text(encoding='utf-8')
rc = (ROOT / 'resources/app.rc').read_text(encoding='utf-8')
manifest = (ROOT / 'resources/app.manifest').read_text(encoding='utf-8')

# The EXE owns one explicit RT_MANIFEST resource in app.rc.
assert '1 RT_MANIFEST "app.manifest"' in rc
assert '<assembly ' in manifest

# MSVC/CMake must not generate a second linker manifest (CVT1100 duplicate MANIFEST ID 1).
assert '/MANIFEST:NO' in cmake

print('v0.1.4 single-manifest contract: PASS')
