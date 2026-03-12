var ExtensionBundle = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // index.ts
  var index_exports = {};
  __export(index_exports, {
    default: () => index_default
  });

  // calculatorEngine.ts
  async function evaluateExpression(expression) {
    const cleanExpr = expression.replace(/[\s]/g, "").replace(/[×]/g, "*").replace(/[÷]/g, "/").replace(/[^0-9+\-*/%^()\.]/g, "");
    if (!cleanExpr) {
      return 0;
    }
    try {
      const result = Function('"use strict"; return (' + cleanExpr + ")")();
      return result;
    } catch (error) {
      console.error("Error evaluating expression:", error);
      throw new Error("Invalid expression");
    }
  }

  // index.ts
  var calculatorExtension = {
    async initialize(context) {
    },
    async activate() {
    },
    async deactivate() {
    },
    onUnload: null,
    async viewActivated() {
    },
    async viewDeactivated() {
    },
    async executeCommand(commandId, args) {
      if (commandId === "calculator.calculate") {
        const expression = (args == null ? void 0 : args.expression) || "";
        if (!expression) return;
        try {
          const result = await evaluateExpression(expression);
          if (typeof navigator !== "undefined") {
            await navigator.clipboard.writeText(result.toString());
          }
        } catch (error) {
          console.error(`Calculator error: ${error}`);
        }
      }
    },
    async search(query) {
      if (!query || query.trim().length === 0) return [];
      try {
        const result = await evaluateExpression(query);
        return [{
          id: `calc-${Date.now()}`,
          title: `${query} = ${result}`,
          subtitle: "Click to copy result",
          score: 1,
          icon: "\u{1F9EE}",
          onAction: () => {
            if (typeof navigator !== "undefined") {
              navigator.clipboard.writeText(result.toString());
            }
          }
        }];
      } catch (e) {
        return [];
      }
    }
  };
  var index_default = calculatorExtension;
  return __toCommonJS(index_exports);
})();
