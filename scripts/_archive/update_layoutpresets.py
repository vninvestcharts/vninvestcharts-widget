with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'r') as f:
    content = f.read()

old = 'layoutPresets={[]}'
new = 'layoutPresets={ALL_PRESETS}'

if old in content:
    new_content = content.replace(old, new)
    with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'w') as f:
        f.write(new_content)
    print('layoutPresets updated successfully!')
else:
    print('Old text not found!')
