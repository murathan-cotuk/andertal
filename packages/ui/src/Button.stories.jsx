import { Button } from "./Button";

export default {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "outline", "ghost"],
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
    },
    fullWidth: { control: "boolean" },
    disabled: { control: "boolean" },
  },
};

export const Primary = { args: { children: "Jetzt kaufen", variant: "primary" } };
export const Secondary = { args: { children: "Mehr erfahren", variant: "secondary" } };
export const Outline = { args: { children: "Vorschau", variant: "outline" } };
export const Ghost = { args: { children: "Abbrechen", variant: "ghost" } };
export const Small = { args: { children: "Klein", variant: "primary", size: "sm" } };
export const Large = { args: { children: "Groß", variant: "primary", size: "lg" } };
export const FullWidth = { args: { children: "Volle Breite", variant: "primary", fullWidth: true } };
export const Disabled = { args: { children: "Deaktiviert", variant: "primary", disabled: true } };
