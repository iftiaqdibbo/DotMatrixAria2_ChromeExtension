import "../components/aria2-options";

const root = document.getElementById("root");
if (root) {
  const wrapper = document.createElement("div");
  wrapper.className = "options-page-wrapper";
  const el = document.createElement("aria2-options");
  wrapper.appendChild(el);
  root.appendChild(wrapper);
}