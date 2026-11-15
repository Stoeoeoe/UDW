import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const contracts = {
  SequenceCard: new Set(['selected', 'onClick', 'accent', 'comment', 'muted', 'label', 'key']),
  SequenceToolbar: new Set(['children']),
  DetailPanel: new Set(['children', 'key']),
};

/** Check component ownership and chrome, including aliased imports and prop spreads. */
export function checkEditorSource(filename, source) {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const imports = new Map();
  const errors = [];
  const graphEditor = /\/(CutsceneGraphEditor|QuestGraphCanvas)\.tsx$/.test(filename);
  const report = (node, message) =>
    errors.push(
      `${filename}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: ${message}`,
    );
  for (const statement of file.statements) {
    const bindings = ts.isImportDeclaration(statement) && statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements)
        imports.set(element.name.text, element.propertyName?.text ?? element.name.text);
    }
  }
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = imports.get(node.tagName.getText(file)) ?? node.tagName.getText(file);
      if (name === 'EditorDocumentFrame' && filename.includes('/screens/'))
        report(
          node,
          'Document frames belong to WorkspaceDocumentViews; screen components supply the body.',
        );
      for (const attribute of node.attributes.properties) {
        if (contracts[name]) {
          if (ts.isJsxSpreadAttribute(attribute))
            report(
              attribute,
              `${name} does not accept prop spreads; its chrome is owned by the shared component.`,
            );
          else if (!contracts[name].has(attribute.name.text))
            report(
              attribute,
              `${name}.${attribute.name.text} bypasses the shared editor language.`,
            );
        }
        if (!ts.isJsxAttribute(attribute)) continue;
        const key = attribute.name.text;
        if (
          graphEditor &&
          [
            'onPaneContextMenu',
            'onConnectStart',
            'onConnectEnd',
            'onNodesChange',
            'onEdgesChange',
            'onNodeDragStart',
            'onNodeDrag',
            'onNodeDragStop',
            'onPointerDownCapture',
            'onKeyDown',
          ].includes(key)
        )
          report(attribute, 'Graph interactions belong to useGraphEditor and GraphEditorShell.');
        if (filename.endsWith('Editor.tsx') && ['bgGradient', 'backgroundImage'].includes(key))
          report(attribute, 'Editor surfaces use the shared neutral surface components.');
        if (
          ['aria-label', 'label'].includes(key) &&
          attribute.initializer &&
          ts.isStringLiteral(attribute.initializer) &&
          /^(Undo|Redo)(\b|\s|\()/.test(attribute.initializer.text)
        ) {
          report(
            attribute,
            'History controls belong to EditorHistoryActions in the application toolbar.',
          );
        }
      }
    }
    if (ts.isJsxText(node) && /^(Undo|Redo)$/.test(node.text.trim()))
      report(node, 'History controls belong to the application toolbar.');
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (graphEditor)
    for (const name of ['GraphEditorShell', 'useGraphEditor'])
      if (![...imports.values()].includes(name))
        errors.push(`${filename}: Graph editors must use ${name}.`);
  return errors;
}

export function checkWorkspaceEntry(source) {
  const file = ts.createSourceFile(
    'WorkspaceDocumentViews.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const errors = [];
  // The private body switch may only be rendered inside the mandatory frame.
  const visit = (node) => {
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(file) === 'WorkspaceDocumentContent'
    ) {
      const parent = node.parent;
      if (
        !ts.isJsxElement(parent) ||
        parent.openingElement.tagName.getText(file) !== 'EditorDocumentFrame'
      )
        errors.push('WorkspaceDocumentContent must be a direct child of EditorDocumentFrame.');
    }
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
      node.declarationList.declarations.some(
        (d) => d.name.getText(file) === 'WorkspaceDocumentContent',
      )
    )
      errors.push('The document body must remain private to the workspace entry point.');
    ts.forEachChild(node, visit);
  };
  visit(file);
  return errors;
}

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(filename) : [filename];
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = filesIn(path.join(root, 'src/components/screens')).filter(
    (file) => file.endsWith('.tsx') && !/\.(test|stories)\.tsx$/.test(file),
  );
  const errors = files.flatMap((file) =>
    checkEditorSource(
      path.relative(root, file).replaceAll('\\', '/'),
      fs.readFileSync(file, 'utf8'),
    ),
  );
  errors.push(
    ...checkWorkspaceEntry(
      fs.readFileSync(
        path.join(root, 'src/components/workspace/WorkspaceDocumentViews.tsx'),
        'utf8',
      ),
    ),
  );
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log(`Editor language: ${files.length} components checked.`);
}
