import { useEffect, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { getPublicServicesSnapshot, getUserProfile, subscribeServices } from "../firebase/firestoreServices";
import { formatStars, getAverageRatingAndCount } from "../utils/rating";
import { getFirstServiceImageUrl } from "../utils/serviceMedia";
import { formatLrdPrice } from "../utils/currency";
import { getServiceSearchLocations, matchesLocationQuery } from "../utils/serviceSearch";
import { getEntityId, getLiveProviderPhoto, getServiceProviderId } from "../utils/providerProfile";
import WhatsAppIcon from "../components/WhatsAppIcon";

const INITIAL_SKELETON_COUNT = 6;

const ServiceListing = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const role = user ? String(user.role || "").toLowerCase() : "";
  const initialServices = getPublicServicesSnapshot();

  const [services, setServices] = useState(initialServices);
  const [providerProfiles, setProviderProfiles] = useState({});
  const [searchInputs, setSearchInputs] = useState({
    selectedCategory: "All",
    location: "",
    minPrice: "",
    maxPrice: ""
  });
  const [appliedFilters, setAppliedFilters] = useState({
    selectedCategory: "All",
    location: "",
    minPrice: "",
    maxPrice: ""
  });
  const [isLoading, setIsLoading] = useState(initialServices.length === 0);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsub;
    try {
      unsub = subscribeServices(appliedFilters, (list) => {
        setServices(list);
        setError("");
        setIsLoading(false);
      });
    } catch (err) {
      setServices([]);
      setError(err?.message || "Failed to load services.");
      setIsLoading(false);
    }
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [appliedFilters]);

  useEffect(() => {
    const providerIds = [...new Set(services.map(getServiceProviderId).filter(Boolean))];
    if (!providerIds.length) {
      setProviderProfiles({});
      return undefined;
    }

    let cancelled = false;

    const embeddedProfiles = services.reduce((acc, service) => {
      const providerId = getServiceProviderId(service);
      if (!providerId) return acc;

      const embeddedProfile =
        (typeof service?.providerId === "object" && service.providerId) ||
        service?.provider ||
        service?.createdBy ||
        service?.owner;

      if (!embeddedProfile || typeof embeddedProfile !== "object") {
        return acc;
      }

      acc[providerId] = {
        id: providerId,
        _id: providerId,
        ...embeddedProfile,
      };
      return acc;
    }, {});

    setProviderProfiles((prev) => ({ ...prev, ...embeddedProfiles }));

    const missingProviderIds = providerIds.filter((providerId) => {
      const embedded = embeddedProfiles[providerId];
      return !embedded?.profilePhoto && !embedded?.name && !embedded?.fullName;
    });

    if (!missingProviderIds.length) {
      return undefined;
    }

    const loadProfiles = async () => {
      const profiles = await Promise.all(missingProviderIds.map((providerId) => getUserProfile(providerId)));
      if (cancelled) return;
      const nextProfiles = profiles.reduce((acc, profile) => {
        const providerId = getEntityId(profile);
        if (providerId) acc[providerId] = profile;
        return acc;
      }, {});
      setProviderProfiles((prev) => ({ ...prev, ...nextProfiles }));
    };

    let timeoutId;
    let idleId;

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(() => {
        loadProfiles();
      }, { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(() => {
        loadProfiles();
      }, 250);
    }

    return () => {
      cancelled = true;
      if (typeof idleId === "number" && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (typeof timeoutId === "number") {
        window.clearTimeout(timeoutId);
      }
    };
  }, [services]);

  const handleBookingClick = (serviceId) => {
    if (!user) {
      navigate("/login");
    } else {
      navigate(`/book/${serviceId}`);
    }
  };

  // Review click handler -> pass showAllMedia flag so details page can render all 10 images
  const handleReviewClick = (serviceId, service) => {
    navigate(`/services/${serviceId}`, { state: { service, showAllMedia: true } });
  };

  const getServiceLocation = (service) => getServiceSearchLocations(service)[0] || "";

  const getProviderName = (service) =>
    service?.providerId?.name ||
    service?.providerName ||
    service?.provider_address_name ||
    service?.ownerName ||
    service?.provider?.providerName ||
    service?.createdBy?.name ||
    service?.provider?.name ||
    service?.provider?.fullName ||
    "Not provided";

  const getProviderPhone = (service) =>
    service?.providerId?.phone ||
    service?.provider?.phone ||
    service?.providerPhone ||
    service?.phone ||
    "Not provided";

  const getProviderAddress = (service) =>
    service?.providerId?.providerAddress ||
    service?.providerAddress ||
    service?.provider_address ||
    service?.addressLine ||
    service?.providerLocation ||
    service?.location ||
    (typeof service?.providerId === "object" ? service?.providerId?.location : "") ||
    service?.providerId?.address ||
    service?.providerId?.location ||
    service?.provider?.address ||
    service?.provider?.location ||
    service?.createdBy?.address ||
    service?.createdBy?.location ||
    service?.address?.street ||
    service?.address ||
    getServiceLocation(service) ||
    "Not provided";

  const getProviderInitials = (name) => {
    const n = (name || "").trim();
    if (!n) return "?";
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    return n.slice(0, 2).toUpperCase();
  };

  const formatPhoneForWhatsApp = (phone) => {
    const p = (phone || "").replace(/\D/g, "");
    return p ? p : null;
  };

  const getWhatsAppUrl = (phone) => {
    const num = formatPhoneForWhatsApp(phone);
    if (!num) return null;
    const text = encodeURIComponent("Hi, I'm interested in your service.");
    return `https://wa.me/${num}?text=${text}`;
  };

  const DESCRIPTION_PREVIEW_LENGTH = 110;
  const showInitialSkeletons = isLoading && services.length === 0 && !error;

  const categories = [
    "All",
    ...new Set(
      services
        .map((service) => service?.category)
        .filter((category) => typeof category === "string" && category.trim())
    )
  ];

  if (appliedFilters.selectedCategory && !categories.includes(appliedFilters.selectedCategory)) {
    categories.push(appliedFilters.selectedCategory);
  }

  const locationSuggestions = [
    ...new Set(
      services
        .flatMap(getServiceSearchLocations)
        .map((location) => String(location).trim())
        .filter(Boolean)
    )
  ].slice(0, 30);

  const filteredServices = services.filter((service) => {
    const category = (service?.category || "").toLowerCase();
    const price = Number(service?.price);

    const selectedCategory = appliedFilters.selectedCategory.toLowerCase();
    const minPrice = Number(appliedFilters.minPrice);
    const maxPrice = Number(appliedFilters.maxPrice);

    const matchesCategory =
      !selectedCategory || selectedCategory === "all" || category === selectedCategory;

    const matchesMinPrice =
      appliedFilters.minPrice === "" || (Number.isFinite(price) && price >= minPrice);

    const matchesMaxPrice =
      appliedFilters.maxPrice === "" || (Number.isFinite(price) && price <= maxPrice);

    const matchesLocation = matchesLocationQuery(service, appliedFilters.location);

    return matchesCategory && matchesMinPrice && matchesMaxPrice && matchesLocation;
  });

  const handleSearch = (event) => {
    event.preventDefault();
    setAppliedFilters(searchInputs);
  };

  return (
    <div className="page-shell services-page">
      <header className="services-page__header">
        <h1 className="services-page__title">Available Services provided in Liberia</h1>
        <p className="services-page__subtitle">Find and book trusted local services. Filter by category, location, or price.</p>
      </header>

      <form className="services-search" onSubmit={handleSearch}>
        <div className="services-search__field services-search__field--category">
          <label htmlFor="services-category" className="services-search__label">Category</label>
          <select
            id="services-category"
            className="services-search__input"
            value={searchInputs.selectedCategory}
            onChange={(e) =>
              setSearchInputs((prev) => ({ ...prev, selectedCategory: e.target.value }))
            }
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div className="services-search__field services-search__field--location">
          <label htmlFor="services-location" className="services-search__label">Location</label>
          <input
            id="services-location"
            list="service-location-options"
            type="text"
            className="services-search__input"
            placeholder="City or area"
            value={searchInputs.location}
            onChange={(e) => setSearchInputs((prev) => ({ ...prev, location: e.target.value }))}
          />
          <datalist id="service-location-options">
            {locationSuggestions.map((location) => (
              <option key={location} value={location} />
            ))}
          </datalist>
        </div>
        <div className="services-search__field services-search__field--price">
          <label htmlFor="services-min-price" className="services-search__label">Min price (LRD)</label>
          <input
            id="services-min-price"
            type="number"
            min="0"
            className="services-search__input"
            placeholder="0"
            value={searchInputs.minPrice}
            onChange={(e) => setSearchInputs((prev) => ({ ...prev, minPrice: e.target.value }))}
          />
        </div>
        <div className="services-search__field services-search__field--price">
          <label htmlFor="services-max-price" className="services-search__label">Max price (LRD)</label>
          <input
            id="services-max-price"
            type="number"
            min="0"
            className="services-search__input"
            placeholder="Any"
            value={searchInputs.maxPrice}
            onChange={(e) => setSearchInputs((prev) => ({ ...prev, maxPrice: e.target.value }))}
          />
        </div>
        <div className="services-search__action">
          <button type="submit" className="services-search__btn">
            Search
          </button>
        </div>
      </form>

      {!isLoading && error && (
        <div className="service-listing-error">
          <p style={{ color: "var(--brand-red)" }}>{error}</p>
          <button
            type="button"
            className="service-listing-retry-btn"
            onClick={() => setIsLoading(true)}
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && filteredServices.length > 0 && (
        <div className="service-listing-grid">
          {filteredServices.map((service) => {
            const { average: embeddedAvg, count: embeddedCount } = getAverageRatingAndCount(service);
            const displayRating = Number.isFinite(Number(service?.averageRating))
              ? Number(service.averageRating)
              : embeddedAvg;
            const reviewCount = Number.isFinite(Number(service?.reviewsCount))
              ? Number(service.reviewsCount)
              : embeddedCount;
            const description = service?.description || "";
            const truncatedDesc =
              description.length > DESCRIPTION_PREVIEW_LENGTH
                ? `${description.slice(0, DESCRIPTION_PREVIEW_LENGTH).trim()}…`
                : description;
            const providerName = getProviderName(service);
            const providerPhone = getProviderPhone(service);
            const location = getServiceLocation(service) || getProviderAddress(service);
            const locationDisplay = location && location !== "Not provided" ? location : "";
            const isAvailable = (service?.availabilityStatus || "").toLowerCase() === "available";
            const providerPhoto = getLiveProviderPhoto(service, providerProfiles);
            const firstImageUrl = getFirstServiceImageUrl(service);

            return (
              <article
                key={service._id}
                className="sc-card"
              >
                <div className="sc-card__image-wrap">
                  {firstImageUrl ? (
                    <img
                      src={firstImageUrl}
                      alt={service.serviceName || "Service"}
                      className="sc-card__image"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.style.display = "none";
                        const wrap = e.target.parentElement;
                        let ph = wrap?.querySelector(".sc-card__image-placeholder");
                        if (!ph && wrap) {
                          ph = document.createElement("div");
                          ph.className = "sc-card__image-placeholder";
                          ph.textContent = "No photo";
                          wrap.appendChild(ph);
                        }
                        if (ph) ph.style.display = "flex";
                      }}
                    />
                  ) : null}
                  <div className="sc-card__image-placeholder" style={{ display: firstImageUrl ? "none" : "flex" }}>
                    No photo
                  </div>
                </div>

                <div className="sc-card__content">
                  <div className="sc-card__tags-row">
                    <div className="sc-card__tags">
                      <span className="sc-card__tag sc-card__tag--category">
                        {service?.category || "General"}
                      </span>
                      <span className={`sc-card__tag sc-card__tag--status ${isAvailable ? "sc-card__tag--available" : "sc-card__tag--unavailable"}`}>
                        {service?.availabilityStatus || "—"}
                      </span>
                    </div>
                    <span className="sc-card__provider-badge" title={providerName}>
                      {providerPhoto ? (
                        <img src={providerPhoto} alt={providerName} className="sc-card__provider-avatar" />
                      ) : (
                        getProviderInitials(providerName)
                      )}
                    </span>
                  </div>

                  <h3 className="sc-card__title">{service.serviceName}</h3>

                  {truncatedDesc && (
                    <p className="sc-card__desc">{truncatedDesc}</p>
                  )}

                  <div className="sc-card__provider">
                    <span className="sc-card__provider-name">{providerName}</span>
                    {locationDisplay && (
                      <span className="sc-card__provider-location" title={locationDisplay}>
                        {locationDisplay.length > 30 ? `${locationDisplay.slice(0, 30)}…` : locationDisplay}
                      </span>
                    )}
                  </div>

                  <div className="sc-card__bottom">
                    <div className="sc-card__price-rating">
                      <span className="sc-card__price">{formatLrdPrice(service?.price)}</span>
                      <span className="sc-card__rating">
                        {formatStars(displayRating)}
                        {displayRating > 0 && (
                          <em className="sc-card__rating-num">{Number(displayRating).toFixed(1)}</em>
                        )}
                        {reviewCount > 0 && (
                          <span className="sc-card__rating-count">({reviewCount})</span>
                        )}
                      </span>
                    </div>

                    <div className="sc-card__actions">
                      <button
                        type="button"
                        className="sc-card__btn sc-card__btn--secondary"
                        onClick={() => handleReviewClick(service._id, service)}
                      >
                        Details
                      </button>
                      {(role === "user" || !role) && (
                        <button
                          type="button"
                          className="sc-card__btn sc-card__btn--primary"
                          onClick={() => handleBookingClick(service._id)}
                          disabled={!isAvailable}
                        >
                          Book
                        </button>
                      )}
                      {getWhatsAppUrl(providerPhone) && (
                        <a
                          href={getWhatsAppUrl(providerPhone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sc-card__whatsapp"
                          title="Chat on WhatsApp"
                          aria-label="Chat on WhatsApp"
                        >
                          <WhatsAppIcon size={20} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showInitialSkeletons && (
        <div className="service-listing-grid" aria-hidden="true">
          {Array.from({ length: INITIAL_SKELETON_COUNT }).map((_, index) => (
            <article key={`service-skeleton-${index}`} className="sc-card sc-card--skeleton">
              <div className="sc-card__image-wrap">
                <div className="sc-card__image-skeleton" />
              </div>

              <div className="sc-card__content">
                <div className="sc-card__tags-row">
                  <div className="sc-card__tags">
                    <span className="sc-card__pill-skeleton" />
                    <span className="sc-card__pill-skeleton sc-card__pill-skeleton--short" />
                  </div>
                  <span className="sc-card__avatar-skeleton" />
                </div>

                <div className="sc-card__line-skeleton sc-card__line-skeleton--title" />
                <div className="sc-card__line-skeleton" />
                <div className="sc-card__line-skeleton sc-card__line-skeleton--short" />

                <div className="sc-card__provider">
                  <span className="sc-card__line-skeleton sc-card__line-skeleton--provider" />
                  <span className="sc-card__line-skeleton sc-card__line-skeleton--location" />
                </div>

                <div className="sc-card__bottom">
                  <div className="sc-card__price-rating">
                    <span className="sc-card__line-skeleton sc-card__line-skeleton--price" />
                  </div>

                  <div className="sc-card__actions">
                    <span className="sc-card__button-skeleton" />
                    <span className="sc-card__button-skeleton sc-card__button-skeleton--primary" />
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {!isLoading && !error && filteredServices.length === 0 && (
        <div className="services-empty">
          <div className="services-empty__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
            </svg>
          </div>
          <h3 className="services-empty__title">No services match your filters</h3>
          <p className="services-empty__text">Try changing the category, location, or price range to see more results.</p>
          <button
            type="button"
            className="services-empty__btn"
            onClick={() => {
              setSearchInputs({ selectedCategory: "All", location: "", minPrice: "", maxPrice: "" });
              setAppliedFilters({ selectedCategory: "All", location: "", minPrice: "", maxPrice: "" });
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
};

export default ServiceListing;
