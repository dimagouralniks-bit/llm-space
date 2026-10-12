import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import {
  renderTooltipDom,
  variableIconDom,
} from "../../../../src/components/thread-playground/variable/prompt-variable-extension";

class TestEvent {
  type: string;
  defaultPrevented = false;
  propagationStopped = false;
  constructor(type: string) {
    this.type = type;
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopPropagation() {
    this.propagationStopped = true;
  }
}

class TestElement {
  tagName: string;
  namespaceURI: string;
  childNodes: (TestElement | TestTextNode)[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<(e: TestEvent) => void>>();

  constructor(tagName: string, namespace = "http://www.w3.org/1999/xhtml") {
    this.tagName = tagName.toUpperCase();
    this.namespaceURI = namespace;
  }

  appendChild<T extends TestElement | TestTextNode>(child: T): T {
    this.childNodes.push(child);
    return child;
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

  set className(value: string) {
    this.setAttribute("class", value);
  }

  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join("");
  }

  set textContent(val: string) {
    this.childNodes = [new TestTextNode(val)];
  }

  addEventListener(type: string, listener: (e: TestEvent) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  querySelector(selector: string): TestElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): TestElement[] {
    const results: TestElement[] = [];
    const visit = (node: TestElement) => {
      for (const child of node.childNodes) {
        if (child instanceof TestElement) {
          if (matchesSelector(child, selector)) {
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

class TestTextNode {
  textContent: string;
  constructor(text: string) {
    this.textContent = text;
  }
}

function matchesSelector(el: TestElement, selector: string): boolean {
  const parts = selector.split(".");
  if (parts.length > 1) {
    const [tag, ...classes] = parts;
    if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) {
      return false;
    }
    const elClasses = el.className.split(/\s+/);
    return classes.every((cls) => elClasses.includes(cls));
  }
  if (selector.startsWith(".")) {
    const cls = selector.slice(1);
    return el.className.split(/\s+/).includes(cls);
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

function installMockDom() {
  const origDoc = globalThis.document;
  const mockDocument = {
    createElement: (tag: string) => new TestElement(tag),
    createElementNS: (ns: string, tag: string) => new TestElement(tag, ns),
  };
  globalThis.document = mockDocument as unknown as Document;

  return () => {
    globalThis.document = origDoc;
  };
}

describe("prompt-variable-extension DOM rendering", () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installMockDom();
  });

  afterEach(() => {
    restore?.();
  });

  test("variableIconDom constructs SVG elements without innerHTML", () => {
    const wrap = variableIconDom();
    expect(wrap.className).toBe("cm-pv-completion-icon");
    const svg = wrap.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg?.querySelectorAll("path").length).toBe(2);
  });

  test("renderTooltipDom constructs inspect button without innerHTML", () => {
    const onInspect = mock();
    const tooltip = renderTooltipDom(
      "user_name",
      { status: "ok", value: "Alice" },
      onInspect
    );

    expect(tooltip.className).toBe("cm-prompt-variable-tooltip");

    const label = tooltip.querySelector(".cm-pv-label");
    expect(label?.textContent).toBe("user_name");

    const value = tooltip.querySelector(".cm-pv-value");
    expect(value?.textContent).toBe("Alice");

    const button = tooltip.querySelector("button.cm-pv-inspect");
    expect(button).not.toBeNull();
    const svg = button?.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg?.querySelectorAll("path").length).toBe(3);
  });

  test("renderTooltipDom safely handles user values without innerHTML execution", () => {
    const maliciousValue = '<img src=x onerror="alert(1)">';
    const tooltip = renderTooltipDom(
      "user_input",
      { status: "ok", value: maliciousValue },
      () => {}
    );

    const valueEl = tooltip.querySelector(".cm-pv-value");
    expect(valueEl?.textContent).toBe(maliciousValue);
    expect(valueEl?.querySelector("img")).toBeNull();
  });
});
