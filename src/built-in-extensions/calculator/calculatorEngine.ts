/**
 * Enhanced calculator engine with support for more complex expressions
 */

// List of supported operators and functions
const OPERATORS = ["+", "-", "*", "/", "%", "^"];

// Tokenize an expression into parts
function tokenize(expr: string): string[] {
  // Replace operators with spaces around them for easier tokenization
  let spaced = expr;

  // Add spaces around operators
  OPERATORS.forEach((op) => {
    spaced = spaced.replace(new RegExp("\\" + op, "g"), ` ${op} `);
  });

  // Fix for negative numbers
  spaced = spaced.replace(/(\d+)\s+\-\s+(\d+)/g, "$1 - $2");

  // Handle parentheses
  spaced = spaced.replace(/\(/g, " ( ");
  spaced = spaced.replace(/\)/g, " ) ");

  // Remove extra spaces and split
  return spaced
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

// Check if a token is a number
function isNumber(token: string): boolean {
  return !isNaN(Number(token));
}

// Check if a token is an operator
function isOperator(token: string): boolean {
  return OPERATORS.includes(token);
}

// Get precedence level of an operator
function precedence(op: string): number {
  if (op === "+" || op === "-") return 1;
  if (op === "*" || op === "/" || op === "%") return 2;
  if (op === "^") return 3;
  return 0;
}

// Apply operation to operands
function applyOp(a: number, b: number, op: string): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      if (b === 0) throw new Error("Division by zero");
      return a / b;
    case "%":
      return a % b;
    case "^":
      return Math.pow(a, b);
    default:
      throw new Error(`Unsupported operator: ${op}`);
  }
}

/**
 * Evaluate a mathematical expression and return the result
 * Supports basic operations, parentheses, and proper order of operations
 */
export async function evaluateExpression(expression: string): Promise<number> {
  // Clean up the expression
  const cleanExpr = expression
    .replace(/[\s]/g, "") // Remove spaces
    .replace(/[×]/g, "*") // Replace × with *
    .replace(/[÷]/g, "/") // Replace ÷ with /
    .replace(/[^0-9+\-*/%^()\.]/g, ""); // Remove non-math characters

  // Special case for empty expression
  if (!cleanExpr) {
    return 0;
  }

  try {
    // For simple expressions, use Function constructor with safety checks
    const result = Function('"use strict"; return (' + cleanExpr + ")")();
    return result;
  } catch (error) {
    console.error("Error evaluating expression:", error);
    throw new Error("Invalid expression");
  }
}

/**
 * Check if a string looks like a mathematical expression
 * This helps the extension identify when it should handle a query
 */
export function looksLikeMathExpression(input: string): boolean {
  // Remove spaces for easier checking
  const cleaned = input.replace(/\s/g, "");

  // Check for presence of math operators
  if (/[\+\-\*\/\%\^×÷=]/.test(cleaned)) {
    return true;
  }

  // Check for numbers with symbols often used in calculations
  if (/^\d+(\.\d+)?$/.test(cleaned) || /\d+\.\d+/.test(cleaned)) {
    return true;
  }

  // Check for common math patterns like "(23)"
  if (/\([0-9\+\-\*\/\%\^]+\)/.test(cleaned)) {
    return true;
  }

  return false;
}
