with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'r') as f:
    content = f.read()

# Find all occurrences
import re
for m in re.finditer(r'<SyncContextConsumer', content):
    idx = m.start()
    print(f'Found at {idx}:')
    print(repr(content[idx:idx+300]))
    print('---')
