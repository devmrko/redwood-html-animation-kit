"""Refresh the double-click animation and component catalogs from their sources."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from framework.python.presentation_offline import create_embedded_example
if __name__=='__main__':
    for source,target in [('examples/animations/index.html','examples/animations/samples.html'),('examples/components/index.html','examples/components/standalone.html')]:
        value=create_embedded_example(ROOT,source)
        if '--check' in sys.argv:
            if not (ROOT/target).is_file() or (ROOT/target).read_text()!=value:raise SystemExit('샘플 배포본을 갱신해 주세요: python3 scripts/build_samples.py')
        else:(ROOT/target).write_text(value)
        print(('Checked ' if '--check' in sys.argv else 'Built ')+target)
