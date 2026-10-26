with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'r') as f:
    content = f.read()

old = 'onLayoutPresetSelect={() => {}}'
new = 'onLayoutPresetSelect={(presetId) => {\n\t\t\t\t\t\t\tconst preset = ALL_PRESETS.find(p => p.id === presetId);\n\t\t\t\t\t\t\tif (preset) {\n\t\t\t\t\t\t\t\tsetLayoutState(preset.layout);\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t}}'

if old in content:
    new_content = content.replace(old, new)
    with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'w') as f:
        f.write(new_content)
    print('onLayoutPresetSelect updated successfully!')
else:
    print('Old text not found!')
