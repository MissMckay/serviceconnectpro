import { createElement } from "react";

export const formatStars = (value) => {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) {
    return "No ratings yet";
  }

  const rounded = Math.round(rating);
  const full = Math.max(0, Math.min(5, rounded));

  return createElement(
    "span",
    { className: "rating-stars", "aria-label": `${full} out of 5 stars` },
    createElement("span", { className: "rating-stars-filled" }, "★".repeat(full)),
    createElement("span", { className: "rating-stars-empty" }, "☆".repeat(5 - full))
  );
};
