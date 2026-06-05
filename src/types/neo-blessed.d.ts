declare module 'neo-blessed' {
  namespace blessed {
    namespace Widgets {
      interface Screen {
        title: string;
        width: number;
        height: number;
        append(el: unknown): void;
        render(): void;
        destroy(): void;
        remove(el: unknown): void;
        key(keys: string | string[], handler: (ch: string, key: { name: string }) => void): void;
        onceKey(keys: string | string[], handler: (ch: string, key: { name: string }) => void): void;
        unkey(keys: string | string[], handler: (ch: string, key: { name: string }) => void): void;
        on(event: string, handler: (...args: unknown[]) => void): void;
        removeListener(event: string, handler: (...args: unknown[]) => void): void;
      }
      interface BoxElement {
        setContent(text: string): void;
        setLabel(text: string): void;
        focus(): void;
        show(): void;
        hide(): void;
        toggle(): void;
      }
      interface TextboxElement extends BoxElement {
        setValue(v: string): void;
        getValue(): string;
        clearValue(): void;
        focus(): void;
        readInput(callback?: (err: unknown, value: string) => void): void;
        key(keys: string | string[], handler: (ch: string, key: { name: string }) => void): void;
      }
      interface TextareaElement extends BoxElement {
        setValue(v: string): void;
        focus(): void;
      }
    }
  }
  const blessed: any;
  export = blessed;
}
