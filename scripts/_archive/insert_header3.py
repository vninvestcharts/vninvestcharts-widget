with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'r') as f:
    content = f.read()

# Find the Chart Grid comment
idx = content.find('Chart Grid with SyncContext')
print('Found at index:', idx)

# Look at the exact characters before it
before = content[:idx]
print('Last 100 chars before:', repr(before[-100:]))

# Find the last '})}' before idx
pos = before.rfind('})}')
print('Last })} at:', pos)
if pos >= 0:
    print('Context:', repr(content[pos:idx+50]))
