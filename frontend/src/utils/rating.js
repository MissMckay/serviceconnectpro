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

/** Compute average rating and count from service.reviews array */
export const getAverageRatingAndCount = (service) => {
  const reviews = Array.isArray(service?.reviews) ? service.reviews : [];
  if (reviews.length === 0) return { average: 0, count: 0 };
  let sum = 0;
  let rated = 0;
  reviews.forEach((r) => {
    const n = Number(r?.rating);
    if (Number.isFinite(n) && n >= 0) {
      sum += n;
      rated += 1;
    }
  });
  const average = rated > 0 ? sum / rated : 0;
  return { average, count: reviews.length };
};
