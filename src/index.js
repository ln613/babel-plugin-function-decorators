const tap = x => { console.log(x); return x }
const range = (a, b) => [...Array(b - a).keys()].map(x => x + a)

const isArrowFunctionDeclaration = (pn, t) => (
  t.isVariableDeclaration(pn) &&
  t.isArrowFunctionExpression((pn.node || pn).declarations[0].init)
)

const isFunctionDeclaration = (p, t) => (
  t.isFunctionDeclaration(p) ||
  t.isArrowFunctionExpression(p) ||
  isArrowFunctionDeclaration(p, t)
)

const isFunctionExport = (p, t) => (
  t.isExportNamedDeclaration(p) &&
  isFunctionDeclaration(p.node.declaration, t)
)

const isDefaultFunctionExport = (p, t) => (
  t.isExportDefaultDeclaration(p) &&
  isFunctionDeclaration(p.node.declaration, t)
)

const getCalleeName = (n, t) => {
  const id = t.isMemberExpression(n) ? n.property : n
  return t.isIdentifier(id) ? id.name : ''
}

const isTopLevel = p => p.parentPath.node.type === 'Program'

const isDecorator = (p, t) => (
  isTopLevel(p) &&
  t.isCallExpression(p.node.expression) &&
  getCalleeName(p.node.expression.callee, t).slice(-1) === '_'
)

const next = p => p.getSibling(p.key + 1)

const getAFEParams = (n, t) => {
  if (!t.isArrowFunctionExpression(n)) return []

  const ps = n.params.map((p, i) => t.stringLiteral(p.name || `param${i}`))
  return [ps, ...getAFEParams(n.body, t)]
}

const getParams = (p, t) => {
  let node = p.node;
  
  if (isFunctionExport(p, t) || isDefaultFunctionExport(p, t)) {
    node = node.declaration
  }

  if (isArrowFunctionDeclaration(node, t)) {
    node = node.declarations[0].init // node is now an ArrowFunctionExpression
  }

  return getAFEParams(node, t)
}

// returns [
//   a list of paths (decorators),
//   target path (the func being decorated)
// ]
const getDecorators = (p, t) => {
  const r = [p]

  while (true) {
    p = next(p)
    if (!p) return null

    // skip extra ;
    if (!t.isEmptyStatement(p)) {
      // reach the end func/λ/const/export
      if (
        isFunctionDeclaration(p, t) ||
        isFunctionExport(p, t) ||
        isDefaultFunctionExport(p, t)
      ) return [r, p]

      if (t.isExpressionStatement(p) && isDecorator(p, t)) r.push(p)
      else break
    }
  }

  return null
}

const applyDecorators = (p, t) => {
  const ds = getDecorators(p, t)
  if (ds && ds[0].length > 0) {
    const [paths, path] = ds
    const params = getParams(path, t)

    const r = iv => paths.reduce(
      (a, n) => t.callExpression(n.node.expression, [a, t.arrayExpression(params.map(p => t.arrayExpression(p)))]),
      iv
    )

    if (isArrowFunctionDeclaration(path, t)) {
      path.node.declarations[0].init = r(path.node.declarations[0].init)
    } else if (isDefaultFunctionExport(path, t)) {
      path.node.declaration = r(path.node.declaration)
    } else if (isFunctionExport(path, t)) {
      path.node.declaration.declarations[0].init = r(path.node.declaration.declarations[0].init)
    }

    range(paths[0].key, paths[paths.length - 1].key + 1)
      .map(x => p.getSibling(x))
      .forEach(x => x.remove())
  }
}

export default ({ types: t }) => ({
  visitor: {
    ExpressionStatement (path) {
      if (isDecorator(path, t)) applyDecorators(path, t)
    }
  }
})
