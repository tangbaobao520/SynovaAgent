declare module 'neo-blessed' {
  namespace blessed {
    namespace Widgets {
      interface BoxElement { setContent(text: string): void; }
      interface TextareaElement { setValue(v: string): void; focus(): void; }
    }
  }
  const blessed: any;
  export = blessed;
}
