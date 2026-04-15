import { Card } from "./Card";

export default {
  title: "UI/Card",
  component: Card,
  tags: ["autodocs"],
  argTypes: {
    hover: { control: "boolean" },
  },
};

export const Default = {
  args: {
    children: (
      <div>
        <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>Produktname</h3>
        <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>Kurze Beschreibung des Produkts oder Inhalts.</p>
      </div>
    ),
  },
};

export const Hoverable = {
  args: {
    hover: true,
    children: (
      <div>
        <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>Klickbare Karte</h3>
        <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>Hover-Effekt mit Schatten und Anheben.</p>
      </div>
    ),
  },
};
