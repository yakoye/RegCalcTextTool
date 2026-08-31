from pathlib import Path

src = (Path(__file__).parents[1] / 'src' / 'main.cpp').read_text(encoding='utf-8')

assert 'const int workLeft = static_cast<int>(work.left);' in src
assert 'const int workTop = static_cast<int>(work.top);' in src
assert 'const int workRight = static_cast<int>(work.right);' in src
assert 'const int workBottom = static_cast<int>(work.bottom);' in src
assert 'g.width = std::min(g.width, workWidth);' in src
assert 'g.height = std::min(g.height, workHeight);' in src
assert 'std::min(g.width, work.right - work.left)' not in src
assert 'std::clamp(g.x, work.left' not in src
print('MSVC geometry type regression: PASS')
