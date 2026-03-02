export const formatLrdPrice = (value) => {
  if (value === null || value === undefined || value === "") {
    return "Not provided";
  }

  return `${value} LRD `;
};

