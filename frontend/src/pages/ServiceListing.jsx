import { useDeferredValue, useEffect, useState, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import {
  getPublicServicesSnapshot,
  subscribeServices,
  getUserProfile,
} from "../firebase/firestoreServices";
import { formatStars, getAverageRatingAndCount } from "../utils/rating";
import { getMarketplaceCardMedia, getServiceMedia } from "../utils/serviceMedia";
import { formatLrdPrice } from "../utils/currency";
import {
  getServiceSearchLocations,
  matchesLocationQuery,
} from "../utils/serviceSearch";
import {
  getServiceProviderId,
  serviceHasProviderSummary,
} from "../utils/providerProfile";
import WhatsAppIcon from "../components/WhatsAppIcon";
import {
  preloadBookingRoute,
  preloadServiceDetailsRoute,
} from "../utils/routePreload";

const INITIAL_SKELETON_COUNT = 6;
const NEW_SERVICE_WINDOW_HOURS = 42;
const NEW_SERVICE_WINDOW_MS = NEW_SERVICE_WINDOW_HOURS * 60 * 60 * 1000;

const ServiceListing = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const role = user ? String(user.role || "").toLowerCase() : "";
  const [services, setServices] = useState(() => getPublicServicesSnapshot());
  const [searchInputs, setSearchInputs] = useState({
    selectedCategory: "All",
    location: "",
    minPrice: "",
    maxPrice: "",
  });
  const [appliedFilters, setAppliedFilters] = useState({
    selectedCategory: "All",
    location: "",
    minPrice: "",
    maxPrice: "",
  });
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeQuickFilter, setActiveQuickFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(() => services.length === 0);
  const [error, setError] = useState("");
  const [providerProfiles, setProviderProfiles] = useState({});
  const [cardMediaIndex, setCardMediaIndex] = useState({});
  const deferredServices = useDeferredValue(services);

  useEffect(() => {
    let unsub;
    try {
      unsub = subscribeServices(appliedFilters, (list) => {
        setServices(list);
        setError("");
        setIsLoading(false);
      }, { pollMs: 0, limit: 24 });
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
    const providersNeedingHydration = deferredServices.filter(
      (service) =>
        getServiceProviderId(service) &&
        !providerProfiles[getServiceProviderId(service)] &&
        (
          !serviceHasProviderSummary(service) ||
          !getMarketplaceCardMedia(service, providerProfiles).providerPhotoUrl
        )
    ).slice(0, 12);

    if (!providersNeedingHydration.length) return undefined;

    let cancelled = false;

    const hydrateProviderProfiles = async () => {
      const profiles = await Promise.all(
        providersNeedingHydration.map((service) => getUserProfile(getServiceProviderId(service)))
      );

      if (cancelled) return;

      const nextProfiles = profiles.reduce((acc, profile) => {
        const providerId = profile?._id || profile?.id;
        if (providerId) acc[providerId] = profile;
        return acc;
      }, {});

      if (Object.keys(nextProfiles).length) {
        setProviderProfiles((prev) => ({ ...prev, ...nextProfiles }));
      }
    };

    hydrateProviderProfiles();

    return () => {
      cancelled = true;
    };
  }, [deferredServices, providerProfiles]);

  const handleBookingClick = (serviceId, service) => {
    if (!user) {
      navigate("/login");
    } else {
      navigate(`/book/${serviceId}`, {
        state: { service, from: "services" },
      });
    }
  };

  const handleReviewClick = (serviceId, service) => {
    navigate(`/services/${serviceId}`, {
      state: { service, showAllMedia: true },
    });
  };

  const getServiceLocation = (service) =>
    getServiceSearchLocations(service)[0] || "";

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
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0])
        .toUpperCase()
        .slice(0, 2);
    }
    return n.slice(0, 2).toUpperCase();
  };

  const formatPhoneForWhatsApp = (phone) => {
    const p = (phone || "").replace(/\D/g, "");
    return p || null;
  };

  const getWhatsAppUrl = (phone) => {
    const num = formatPhoneForWhatsApp(phone);
    if (!num) return null;
    const text = encodeURIComponent("Hi, I'm interested in your service.");
    return `https://wa.me/${num}?text=${text}`;
  };

  const getCardImageIndex = (serviceId, mediaCount) => {
    const nextIndex = Number(cardMediaIndex[serviceId] || 0);
    if (!mediaCount || nextIndex < 0) return 0;
    return nextIndex >= mediaCount ? 0 : nextIndex;
  };

  const shiftCardImage = (event, serviceId, mediaCount, direction) => {
    event.preventDefault();
    event.stopPropagation();
    if (!mediaCount || mediaCount <= 1) return;

    setCardMediaIndex((prev) => {
      const currentIndex = Number(prev[serviceId] || 0);
      const nextIndex = (currentIndex + direction + mediaCount) % mediaCount;
      return {
        ...prev,
        [serviceId]: nextIndex,
      };
    });
  };

  const DESCRIPTION_PREVIEW_LENGTH = 110;
  const showInitialSkeletons = isLoading && services.length === 0 && !error;
  const showResultsBar = !showInitialSkeletons;

  const categories = useMemo(() => {
    const nextCategories = [
      "All",
      ...new Set(
        deferredServices
          .map((service) => service?.category)
          .filter((category) => typeof category === "string" && category.trim())
      ),
    ];

    if (
      appliedFilters.selectedCategory &&
      !nextCategories.includes(appliedFilters.selectedCategory)
    ) {
      nextCategories.push(appliedFilters.selectedCategory);
    }

    return nextCategories;
  }, [appliedFilters.selectedCategory, deferredServices]);

  const locationSuggestions = useMemo(
    () =>
      [
        ...new Set(
          deferredServices
            .flatMap(getServiceSearchLocations)
            .map((location) => String(location).trim())
            .filter(Boolean)
        ),
      ].slice(0, 30),
    [deferredServices]
  );

  const {
    sortedServices,
    availableServicesCount,
    newestServicesCount,
  } = useMemo(() => {
    const now = Date.now();
    const freshThreshold = now - NEW_SERVICE_WINDOW_MS;
    const selectedCategory = appliedFilters.selectedCategory.toLowerCase();
    const minPrice = Number(appliedFilters.minPrice);
    const maxPrice = Number(appliedFilters.maxPrice);

    const nextFiltered = deferredServices.filter((service) => {
      const category = (service?.category || "").toLowerCase();
      const price = Number(service?.price);

      const matchesCategory =
        !selectedCategory ||
        selectedCategory === "all" ||
        category === selectedCategory;

      const matchesMinPrice =
        appliedFilters.minPrice === "" ||
        (Number.isFinite(price) && price >= minPrice);

      const matchesMaxPrice =
        appliedFilters.maxPrice === "" ||
        (Number.isFinite(price) && price <= maxPrice);

      const matchesLocation = matchesLocationQuery(
        service,
        appliedFilters.location
      );

      return (
        matchesCategory &&
        matchesMinPrice &&
        matchesMaxPrice &&
        matchesLocation
      );
    });

    let availableCount = 0;
    let newestCount = 0;

    const quickFiltered = nextFiltered.filter((service) => {
      const createdAtTime =
        service?.createdAt instanceof Date
          ? service.createdAt.getTime()
          : new Date(service?.createdAt || 0).getTime();

      const isFresh =
        Number.isFinite(createdAtTime) && createdAtTime >= freshThreshold;

      const isAvailable =
        String(service?.availabilityStatus || "").toLowerCase() === "available";

      if (isAvailable) availableCount += 1;
      if (isFresh) newestCount += 1;

      if (activeQuickFilter === "newest") return isFresh;
      if (activeQuickFilter === "available") return isAvailable;
      return true;
    });

    const nextSorted = [...quickFiltered].sort((a, b) => {
      const aTime =
        a?.createdAt instanceof Date
          ? a.createdAt.getTime()
          : new Date(a?.createdAt || 0).getTime();

      const bTime =
        b?.createdAt instanceof Date
          ? b.createdAt.getTime()
          : new Date(b?.createdAt || 0).getTime();

      return bTime - aTime;
    });

    return {
      sortedServices: nextSorted,
      availableServicesCount: availableCount,
      newestServicesCount: newestCount,
    };
  }, [activeQuickFilter, appliedFilters, deferredServices]);

  const activeFilterChips = useMemo(
    () =>
      [
        appliedFilters.selectedCategory &&
        appliedFilters.selectedCategory !== "All"
          ? `Category: ${appliedFilters.selectedCategory}`
          : "",
        appliedFilters.location ? `Location: ${appliedFilters.location}` : "",
        appliedFilters.minPrice
          ? `Min: ${formatLrdPrice(appliedFilters.minPrice)}`
          : "",
        appliedFilters.maxPrice
          ? `Max: ${formatLrdPrice(appliedFilters.maxPrice)}`
          : "",
      ].filter(Boolean),
    [appliedFilters]
  );

  const hasActiveFilters = activeFilterChips.length > 0;

  const resetFilters = () => {
    const cleared = {
      selectedCategory: "All",
      location: "",
      minPrice: "",
      maxPrice: "",
    };
    setSearchInputs(cleared);
    setAppliedFilters(cleared);
    setActiveQuickFilter("all");
  };

  const applyCategoryFilter = (category) => {
    const nextFilters = {
      ...searchInputs,
      selectedCategory: category,
    };
    setSearchInputs(nextFilters);
    setAppliedFilters(nextFilters);
    setIsSummaryOpen(false);
    setIsSearchOpen(false);
  };

  const handleSearch = (event) => {
    event.preventDefault();

    const normalizedFilters = {
      selectedCategory:
        typeof searchInputs.selectedCategory === "string" &&
        searchInputs.selectedCategory.trim()
          ? searchInputs.selectedCategory.trim()
          : "All",
      location: String(searchInputs.location || "").trim(),
      minPrice: String(searchInputs.minPrice || "").trim(),
      maxPrice: String(searchInputs.maxPrice || "").trim(),
    };

    const minPrice = Number(normalizedFilters.minPrice);
    const maxPrice = Number(normalizedFilters.maxPrice);

    if (
      normalizedFilters.minPrice !== "" &&
      normalizedFilters.maxPrice !== "" &&
      Number.isFinite(minPrice) &&
      Number.isFinite(maxPrice) &&
      minPrice > maxPrice
    ) {
      normalizedFilters.minPrice = String(maxPrice);
      normalizedFilters.maxPrice = String(minPrice);
    }

    setSearchInputs(normalizedFilters);
    setAppliedFilters(normalizedFilters);
    setIsSearchOpen(false);
  };

  return (
    <div className="page-shell services-page">
      <button
        type="button"
        className={`services-summary-backdrop ${isSummaryOpen ? "is-open" : ""}`}
        aria-hidden={!isSummaryOpen}
        onClick={() => setIsSummaryOpen(false)}
      ></button>

      <aside
        className={`services-summary-drawer ${isSummaryOpen ? "is-open" : ""}`}
        aria-label="Services summary"
      >
        <div className="services-summary-drawer__header">
          <div>
            <p className="services-summary-drawer__eyebrow">Category</p>
            <h2 className="services-summary-drawer__title">
              Service categories
            </h2>
          </div>
          <button
            type="button"
            className="services-summary-drawer__close"
            onClick={() => setIsSummaryOpen(false)}
          >
            Close
          </button>
        </div>

        <div className="services-summary-drawer__stats">
          <div className="services-summary-drawer__stat">
            <strong>{services.length}</strong>
            <span>Total services</span>
          </div>
          <div className="services-summary-drawer__stat">
            <strong>{availableServicesCount}</strong>
            <span>Available</span>
          </div>
        </div>

        <div className="services-summary-drawer__list" role="list">
          <button
            type="button"
            className={`services-summary-drawer__item ${
              searchInputs.selectedCategory === "All" ? "is-active" : ""
            }`}
            onClick={() => applyCategoryFilter("All")}
          >
            <span>All categories</span>
          </button>

          {categories
            .filter((category) => category !== "All")
            .map((category) => (
              <button
                key={`summary-category-${category}`}
                type="button"
                className={`services-summary-drawer__item ${
                  searchInputs.selectedCategory === category ? "is-active" : ""
                }`}
                onClick={() => applyCategoryFilter(category)}
              >
                <span>{category}</span>
              </button>
            ))}
        </div>
      </aside>

      <header className="services-page__header">
        <div className="services-page__header-row">
          <div className="services-page__title-block">
            <h1 className="services-page__title">
              Available Services provided in Liberia
            </h1>
          </div>
        </div>
      </header>

      <section className="services-toolbar" aria-label="Service tools">
        <button
          type="button"
          className="services-toolbar__btn services-summary-trigger"
          onClick={() => setIsSummaryOpen(true)}
          aria-label="Open service categories"
        >
          <span />
          <span />
          <span />
          <strong>Category</strong>
        </button>

        <button
          type="button"
          className={`services-toolbar__btn ${isSearchOpen ? "is-active" : ""}`}
          onClick={() => setIsSearchOpen((prev) => !prev)}
        >
          Search
        </button>

        <button
          type="button"
          className={`services-toolbar__btn ${
            activeQuickFilter === "newest" ? "is-active" : ""
          }`}
          onClick={() =>
            setActiveQuickFilter((prev) =>
              prev === "newest" ? "all" : "newest"
            )
          }
        >
          Newest
        </button>

        <button
          type="button"
          className={`services-toolbar__btn ${
            activeQuickFilter === "available" ? "is-active" : ""
          }`}
          onClick={() =>
            setActiveQuickFilter((prev) =>
              prev === "available" ? "all" : "available"
            )
          }
        >
          Available
        </button>
      </section>

      {isSearchOpen && (
        <section className="services-search-panel">
          <div className="services-search-panel__top">
            <div>
              <h2 className="services-search-panel__title">Search services</h2>
              <p className="services-search-panel__subtitle">
                Use the filters below to narrow the listing.
              </p>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="services-search-panel__reset"
                onClick={resetFilters}
              >
                Clear filters
              </button>
            )}
          </div>

          <form className="services-search" onSubmit={handleSearch}>
            <div className="services-search__field services-search__field--category">
              <label
                htmlFor="services-category"
                className="services-search__label"
              >
                Category
              </label>
              <select
                id="services-category"
                className="services-search__input"
                value={searchInputs.selectedCategory}
                onChange={(e) =>
                  setSearchInputs((prev) => ({
                    ...prev,
                    selectedCategory: e.target.value,
                  }))
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
              <label
                htmlFor="services-location"
                className="services-search__label"
              >
                Location
              </label>
              <input
                id="services-location"
                list="service-location-options"
                type="text"
                className="services-search__input"
                placeholder="City, area, or address"
                value={searchInputs.location}
                onChange={(e) =>
                  setSearchInputs((prev) => ({
                    ...prev,
                    location: e.target.value,
                  }))
                }
              />
              <datalist id="service-location-options">
                {locationSuggestions.map((location) => (
                  <option key={location} value={location} />
                ))}
              </datalist>
            </div>

            <div className="services-search__field services-search__field--price">
              <label
                htmlFor="services-min-price"
                className="services-search__label"
              >
                Min price (LRD)
              </label>
              <input
                id="services-min-price"
                type="number"
                min="0"
                className="services-search__input"
                placeholder="0"
                value={searchInputs.minPrice}
                onChange={(e) =>
                  setSearchInputs((prev) => ({
                    ...prev,
                    minPrice: e.target.value,
                  }))
                }
              />
            </div>

            <div className="services-search__field services-search__field--price">
              <label
                htmlFor="services-max-price"
                className="services-search__label"
              >
                Max price (LRD)
              </label>
              <input
                id="services-max-price"
                type="number"
                min="0"
                className="services-search__input"
                placeholder="Any"
                value={searchInputs.maxPrice}
                onChange={(e) =>
                  setSearchInputs((prev) => ({
                    ...prev,
                    maxPrice: e.target.value,
                  }))
                }
              />
            </div>

            <div className="services-search__action">
              <button type="submit" className="services-search__btn">
                Search Services
              </button>
            </div>
          </form>

          {hasActiveFilters && (
            <div className="services-active-filters" aria-label="Active filters">
              {activeFilterChips.map((chip) => (
                <span key={chip} className="services-active-filters__chip">
                  {chip}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {showResultsBar && (
      <section className="services-results-bar" aria-label="Results summary">
        <div>
          <p className="services-results-bar__eyebrow">Search results</p>
          <h2 className="services-results-bar__title">
            {sortedServices.length} services found
          </h2>
        </div>
        <div className="services-results-bar__meta">
          <span>{availableServicesCount} available now</span>
          <span>{newestServicesCount} newest</span>
        </div>
      </section>
      )}

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

      {!isLoading && !error && sortedServices.length > 0 && (
        <div className="service-listing-grid">
          {sortedServices.map((service) => {
            const hydratedService = service;
            const { average: embeddedAvg, count: embeddedCount } =
              getAverageRatingAndCount(hydratedService);

            const displayRating = Number.isFinite(Number(hydratedService?.averageRating))
              ? Number(hydratedService.averageRating)
              : embeddedAvg;

            const reviewCount = Number.isFinite(Number(hydratedService?.reviewsCount))
              ? Number(hydratedService.reviewsCount)
              : embeddedCount;

            const description = hydratedService?.description || "";
            const truncatedDesc =
              description.length > DESCRIPTION_PREVIEW_LENGTH
                ? `${description
                    .slice(0, DESCRIPTION_PREVIEW_LENGTH)
                    .trim()}…`
                : description;

            const providerName = getProviderName(hydratedService);
            const providerPhone = getProviderPhone(hydratedService);
            const location = getServiceLocation(hydratedService) || getProviderAddress(hydratedService);
            const locationDisplay =
              location && location !== "Not provided" ? location : "";

            const isAvailable =
              (hydratedService?.availabilityStatus || "").toLowerCase() === "available";

            const serviceMedia = getServiceMedia(hydratedService);
            const activeMediaIndex = getCardImageIndex(
              hydratedService._id,
              serviceMedia.length
            );
            const activeMediaEntry = serviceMedia[activeMediaIndex] || null;

            const { serviceImageUrl: fallbackImageUrl, providerPhotoUrl: providerPhoto, mediaCount } =
              getMarketplaceCardMedia(hydratedService, providerProfiles);
            const cardImageUrl = activeMediaEntry?.url || fallbackImageUrl;

            const createdAtTime =
              hydratedService?.createdAt instanceof Date
                ? hydratedService.createdAt.getTime()
                : new Date(hydratedService?.createdAt || 0).getTime();

            const isFresh =
              Number.isFinite(createdAtTime) &&
              createdAtTime >= Date.now() - NEW_SERVICE_WINDOW_MS;

            return (
              <article key={hydratedService._id} className="sc-card">
                <div
                  className="sc-card__image-wrap"
                  onClick={() => handleReviewClick(hydratedService._id, hydratedService)}
                  onPointerDown={() => preloadServiceDetailsRoute(hydratedService._id)}
                  onTouchStart={() => preloadServiceDetailsRoute(hydratedService._id)}
                  onMouseEnter={() => preloadServiceDetailsRoute(hydratedService._id)}
                  onFocus={() => preloadServiceDetailsRoute(hydratedService._id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleReviewClick(hydratedService._id, hydratedService);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open details for ${
                    hydratedService.serviceName || "this service"
                  }`}
                >
                  {mediaCount > 1 && (
                    <>
                      <button
                        type="button"
                        className="sc-card__image-nav sc-card__image-nav--prev"
                        onClick={(event) =>
                          shiftCardImage(event, hydratedService._id, mediaCount, -1)
                        }
                        aria-label="Show previous service photo"
                      >
                        {"<"}
                      </button>
                      <button
                        type="button"
                        className="sc-card__image-nav sc-card__image-nav--next"
                        onClick={(event) =>
                          shiftCardImage(event, hydratedService._id, mediaCount, 1)
                        }
                        aria-label="Show next service photo"
                      >
                        {">"}
                      </button>
                    </>
                  )}

                  {cardImageUrl ? (
                    <img
                      src={cardImageUrl}
                      alt={hydratedService.serviceName || "Service"}
                      className="sc-card__image"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.style.display = "none";
                        const wrap = e.target.parentElement;
                        let ph = wrap?.querySelector(
                          ".sc-card__image-placeholder"
                        );

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

                  <div className="sc-card__image-overlay" />

                  <div className="sc-card__image-badges">
                    {mediaCount > 1 && (
                      <span className="sc-card__image-badge">
                        {mediaCount} photos
                      </span>
                    )}
                    {isFresh && (
                      <span className="sc-card__image-badge sc-card__image-badge--fresh">
                        New
                      </span>
                    )}
                    <span
                      className={`sc-card__image-badge ${
                        isAvailable
                          ? "sc-card__image-badge--available"
                          : "sc-card__image-badge--unavailable"
                      }`}
                    >
                      {isAvailable ? "Available" : "Unavailable"}
                    </span>
                  </div>

                  <div
                    className="sc-card__image-placeholder"
                    style={{ display: cardImageUrl ? "none" : "flex" }}
                  >
                    No photo
                  </div>
                </div>

                <div className="sc-card__content">
                  <div className="sc-card__tags-row">
                    <div className="sc-card__tags">
                      <span className="sc-card__tag sc-card__tag--category">
                        {hydratedService?.category || "General"}
                      </span>
                      <span
                        className="sc-card__tag sc-card__tag--location"
                        title={locationDisplay || "Location not provided"}
                      >
                        {locationDisplay || "Location pending"}
                      </span>
                    </div>

                    <span className="sc-card__provider-badge" title={providerName}>
                      {providerPhoto ? (
                        <img
                          src={providerPhoto}
                          alt={providerName}
                          className="sc-card__provider-avatar"
                        />
                      ) : (
                        getProviderInitials(providerName)
                      )}
                    </span>
                  </div>

                  <h3 className="sc-card__title">{hydratedService.serviceName}</h3>

                  {truncatedDesc && (
                    <p className="sc-card__desc">{truncatedDesc}</p>
                  )}

                  <div className="sc-card__provider">
                    <span className="sc-card__provider-label">Provided by</span>
                    <span className="sc-card__provider-name">{providerName}</span>
                    <span
                      className="sc-card__provider-location"
                      title={locationDisplay || "Location not provided"}
                    >
                      {locationDisplay || "Location not provided"}
                    </span>
                  </div>

                  <div className="sc-card__bottom">
                    <div className="sc-card__price-rating">
                      <span className="sc-card__price">
                        {formatLrdPrice(hydratedService?.price)}
                      </span>
                      <span className="sc-card__rating">
                        {formatStars(displayRating)}
                        {displayRating > 0 && (
                          <em className="sc-card__rating-num">
                            {Number(displayRating).toFixed(1)}
                          </em>
                        )}
                        {reviewCount > 0 && (
                          <span className="sc-card__rating-count">
                            ({reviewCount})
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="sc-card__actions">
                      <button
                        type="button"
                        className="sc-card__btn sc-card__btn--secondary"
                        onClick={() => handleReviewClick(hydratedService._id, hydratedService)}
                        onPointerDown={() => preloadServiceDetailsRoute(hydratedService._id)}
                        onTouchStart={() => preloadServiceDetailsRoute(hydratedService._id)}
                        onMouseEnter={() => preloadServiceDetailsRoute(hydratedService._id)}
                        onFocus={() => preloadServiceDetailsRoute(hydratedService._id)}
                        aria-label={`View details for ${hydratedService.serviceName || "this service"}`}
                        title="View details"
                      >
                        View
                      </button>

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

                      {(role === "user" || !role) && (
                        <button
                          type="button"
                          className="sc-card__btn sc-card__btn--primary"
                          onClick={() => handleBookingClick(hydratedService._id, hydratedService)}
                          onPointerDown={() => preloadBookingRoute(hydratedService._id)}
                          onTouchStart={() => preloadBookingRoute(hydratedService._id)}
                          onMouseEnter={() => preloadBookingRoute(hydratedService._id)}
                          onFocus={() => preloadBookingRoute(hydratedService._id)}
                          disabled={!isAvailable}
                        >
                          Book
                        </button>
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
            <article
              key={`service-skeleton-${index}`}
              className="sc-card sc-card--skeleton"
            >
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

      {!isLoading && !error && sortedServices.length === 0 && (
        <div className="services-empty">
          <div className="services-empty__icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="48"
              height="48"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
            </svg>
          </div>

          <h3 className="services-empty__title">
            No services match your filters
          </h3>
          <p className="services-empty__text">
            Try changing the category, location, or price range to see more
            results.
          </p>

          <button
            type="button"
            className="services-empty__btn"
            onClick={() => {
              setSearchInputs({
                selectedCategory: "All",
                location: "",
                minPrice: "",
                maxPrice: "",
              });
              setAppliedFilters({
                selectedCategory: "All",
                location: "",
                minPrice: "",
                maxPrice: "",
              });
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
