declare module '*.md' {
  const text: string;
  export default text;
}

declare module '*.module.scss' {
  const classes: { [className: string]: string };
  export default classes;
}
