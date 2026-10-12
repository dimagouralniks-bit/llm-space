import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  renderTooltipDom,
  variableIconDom,
} from "../../../../src/components/thread-playground/variable/prompt-variable-extension";

// Minimal DOM fake for testing DOM elements created in prompt-variable-extension
class FakeNode {
  nodeType = 1;
  ownerDocument: FakeDocument;
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];

  constructor(ownerDocument: FakeDocument) {
    this.ownerDocument = ownerDocument;
  }

  appendChild<T extends FakeNode>(child: T): T {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join("");
  }

  set textContent(value: string) {
    this.childNodes = [new FakeTextNode(value, this.ownerDocument)];
  }
}

class FakeTextNode extends FakeNode {
  value: string;
  constructor(value: string, ownerDocument: FakeDocument) {
    super(ownerDocument);
    this.value = value;
  }

  override get textContent(): string {
    return this.value;
  }
}

class FakeElement extends FakeNode {
  tagName: string;
  namespaceURI: string;
  attributes = new Map<string, string>();
  listeners = new Map<string, ((e: unknown) => void)[]>();

  constructor(tagName: string, ownerDocument: FakeDocument, ns = "http://www.w3.org/1999/xhtml") {
    super(ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.namespaceURI = ns;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  get className(): string {
    return this.getAttribute("class") ?? "";
  }

  set className(val: string) {
    this.setAttribute("class", val);
  }

  get title(): string {
    return this.getAttribute("title") ?? "";
  }

  set title(val: string) {
    this.setAttribute("title", val);
  }

  get type(): string {
    return this.getAttribute("type") ?? "";
  }

  set type(val: string) {
    this.setAttribute("type", val);
  }

  addEventListener(type: string, listener: (e: unknown) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  dispatchEvent(event: { type: string; preventDefault?: () => void; stopPropagation?: () => void }) {
    const list = this.listeners.get(event.type) ?? [];
    for (const l of list) {
      l(event);
    }
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const results: FakeElement[] = [];
    const visit = (node: FakeNode) => {
      for (const child of node.childNodes) {
        if (child instanceof FakeElement) {
          if (matches(child, selector)) {
            results.push(child);
          }
          visit(child);
        }
      }
    };
    visit(this);
    return results;
  }
}

function matches(el: FakeElement, selector: string): boolean {
  if (selector.startsWith(".")) {
    const cls = selector.slice(1);
    return el.className.split(/\s+/).includes(cls);
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

class FakeDocument {
  createElement(tag: string): FakeElement {
    return new FakeElement(tag, this);
  }

  createElementNS(ns: string, tag: string): FakeElement {
    return new FakeElement(tag, this, ns);
  }
}

describe("prompt-variable-extension DOM helpers", () => {
  const origDocument = globalThis.document;

  beforeEach(() => {
    (globalThis as unknown as { document: FakeDocument }).document = new FakeDocument();
  });

  afterEach(() => {
    (globalThis as unknown as { document: unknown }).document = origDocument;
  });

  test("variableIconDom creates valid DOM structure without innerHTML", () => {
    const el = variableIconDom();
    expect(el).not.toBeNull();
    expect(el.className).toBe("cm-pv-completion-icon");

    const svg = el.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");

    const paths = svg?.querySelectorAll("path");
    expect(paths?.length).toBe(2);
  });

  test("renderTooltipDom renders variable values securely and safely", () => {
    const maliciousValue = '<img src=x onerror="alert(1)">';
    const tooltip = renderTooltipDom("user_var", {
      status: "ok",
      value: maliciousValue,
    });

    expect(tooltip).not.toBeNull();
    expect(tooltip.className).toBe("cm-prompt-variable-tooltip");

    const label = tooltip.querySelector(".cm-pv-label");
    expect(label?.textContent).toBe("user_var");

    const valueEl = tooltip.querySelector(".cm-pv-value");
    expect(valueEl?.textContent).toBe(maliciousValue);
    expect(valueEl?.querySelector("img")).toBeNull();
  });

  test("renderTooltipDom renders inspect button with SVG icon securely when onInspect is provided", () => {
    let inspectedName = "";
    const onInspect = (name: string) => {
      inspectedName = name;
    };

    const tooltip = renderTooltipDom(
      "my_var",
      { status: "ok", value: "hello" },
      onInspect
    );

    const button = tooltip.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.className).toBe("cm-pv-inspect");

    const svg = button?.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.querySelectorAll("path").length).toBe(3);

    button?.dispatchEvent({
      type: "click",
      preventDefault: () => {},
      stopPropagation: () => {},
    });
    expect(inspectedName).toBe("my_var");
  });
});
