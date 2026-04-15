import { createGlobalStyle } from "styled-components";

const GlobalStyle = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Inter, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
`;

function withGlobalStyles(Story) {
  return (
    <>
      <GlobalStyle />
      <Story />
    </>
  );
}

/** @type {import('@storybook/react').Preview} */
const preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    layout: "centered",
  },
  decorators: [withGlobalStyles],
};

export default preview;
