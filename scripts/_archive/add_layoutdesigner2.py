with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'rb') as f:
    content = f.read()

old = b'onOpenSettings={() => {\n\t\t\t\t\t\t\tconsole.log("Open settings");\n\t\t\t\t\t\t}\n\t\t\t\t\t\t/>\n\t\t\t\t)}\n\n\t\t\t\t{/* Chart Grid with SyncContext */}'

new = b'onOpenSettings={() => {\n\t\t\t\t\t\t\tconsole.log("Open settings");\n\t\t\t\t\t\t}\n\t\t\t\t\t\t/>\n\t\t\t\t)}\n\n\t\t\t\t{/* Layout Designer */}\n\t\t\t\t{showLayoutDesigner && (\n\t\t\t\t\t<LayoutDesigner\n\t\t\t\t\t\tlayout={layout}\n\t\t\t\t\t\tonLayoutChange={setLayoutState}\n\t\t\t\t\t\tonSaveAsPreset={(preset) => {\n\t\t\t\t\t\t\tconsole.log("Save preset:", preset);\n\t\t\t\t\t\t}\n\t\t\t\t\t\t}\n\t\t\t\t\t\tavailablePresets={[]}\n\t\t\t\t\t\tisOpen={showLayoutDesigner}\n\t\t\t\t\t\tonClose={() => setShowLayoutDesigner(false)}\n\t\t\t\t\t/>\n\t\t\t\t)}\n\n\t\t\t\t{/* Chart Grid with SyncContext */}'

print('Old in content:', old in content)

if old in content:
    new_content = content.replace(old, new)
    with open(r'C:\Mujoco Projects\vninvestcharts\src\widget\VNInvestMultiCharts.tsx', 'wb') as f:
        f.write(new_content)
    print('LayoutDesigner added successfully!')
else:
    print('Old text not found!')
