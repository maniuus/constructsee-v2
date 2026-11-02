export function evaluateExpression(raw: string): number {
  const expression = raw.replace(/\s+/g, "").replace(/,/g, ".");
  let index = 0;

  const parseExpr = (): number => {
    let value = parseTerm();
    while (expression[index] === "+" || expression[index] === "-") {
      const op = expression[index++];
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  };

  const parseTerm = (): number => {
    let value = parseFactor();
    while (expression[index] === "*" || expression[index] === "/") {
      const op = expression[index++];
      const rhs = parseFactor();
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  };

  const parseFactor = (): number => {
    let sign = 1;
    while (expression[index] === "+" || expression[index] === "-") {
      if (expression[index] === "-") sign = -sign;
      index += 1;
    }
    let value: number;
    if (expression[index] === "(") {
      index += 1;
      value = parseExpr();
      if (expression[index] === ")") index += 1;
    } else {
      const start = index;
      while (index < expression.length && /[0-9.]/.test(expression[index])) index += 1;
      if (start === index) throw new Error("Ekspresi tidak valid");
      value = Number(expression.slice(start, index));
    }
    return sign * value;
  };

  if (expression.length === 0) throw new Error("Ekspresi kosong");
  const result = parseExpr();
  if (index !== expression.length) throw new Error("Ekspresi tidak valid");
  if (!Number.isFinite(result)) throw new Error("Hasil tidak terdefinisi");
  return result;
}
