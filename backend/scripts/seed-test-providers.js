require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");
const Service = require("../models/Service");

const PROVIDER_COUNT = 10;
const SERVICES_PER_PROVIDER = 10;
const MIN_IMAGES_PER_SERVICE = 5;
const MAX_IMAGES_PER_SERVICE = 10;
const SEEDED_PROVIDER_PASSWORD = "SeededProvider123!";

const categories = [
  "Electrical",
  "Plumbing",
  "Cleaning",
  "Carpentry",
  "Hair & Beauty",
  "Tailoring",
  "Generator Repair",
  "AC Repair",
  "Painting",
  "Mobile Money Support",
  "Borehole Service",
  "Catering",
];

const cities = [
  "Monrovia",
  "Paynesville",
  "Buchanan",
  "Gbarnga",
  "Kakata",
  "Harper",
  "Voinjama",
  "Greenville",
  "Zwedru",
  "Ganta",
];

const serviceCatalog = [
  {
    name: "House Wiring Installation",
    category: "Electrical",
    keywords: ["electrician", "wiring", "tools"],
    description:
      "Home and small business wiring, sockets, lighting fixes, and electrical maintenance for properties in Liberia.",
  },
  {
    name: "Generator Maintenance",
    category: "Generator Repair",
    keywords: ["generator", "mechanic", "repair"],
    description:
      "Generator servicing, troubleshooting, and routine maintenance for homes, shops, and offices.",
  },
  {
    name: "Pipe Leak Repair",
    category: "Plumbing",
    keywords: ["plumber", "pipe", "repair"],
    description:
      "Leak detection, tap replacement, bathroom pipe fixes, and drainage support for residential properties.",
  },
  {
    name: "Water Tank Installation",
    category: "Plumbing",
    keywords: ["water tank", "plumber", "installation"],
    description:
      "Setup of overhead tanks, connections, and water flow repairs for compounds and small buildings.",
  },
  {
    name: "Deep Home Cleaning",
    category: "Cleaning",
    keywords: ["cleaning", "home", "service"],
    description:
      "Deep indoor cleaning for homes, offices, kitchens, and post-event spaces with practical testing data.",
  },
  {
    name: "Office Cleaning Service",
    category: "Cleaning",
    keywords: ["office cleaning", "cleaner", "workspace"],
    description:
      "Routine cleaning for offices, shops, and business spaces, including floors, windows, and shared areas.",
  },
  {
    name: "Custom Tailoring",
    category: "Tailoring",
    keywords: ["tailor", "sewing", "fashion"],
    description:
      "Custom clothing stitching, alterations, and fitting services for daily wear, uniforms, and occasions.",
  },
  {
    name: "Hair Braiding & Styling",
    category: "Hair & Beauty",
    keywords: ["hair salon", "braiding", "styling"],
    description:
      "Braiding, styling, and beauty appointments suitable for salon and freelancer provider listings.",
  },
  {
    name: "Room and Exterior Painting",
    category: "Painting",
    keywords: ["painting", "house painter", "wall"],
    description:
      "Interior and exterior painting for homes, compounds, and small commercial properties.",
  },
  {
    name: "Furniture Carpentry",
    category: "Carpentry",
    keywords: ["carpenter", "furniture", "woodwork"],
    description:
      "Furniture repairs, shelving, door work, and custom woodwork for households and small businesses.",
  },
  {
    name: "Borehole Pump Service",
    category: "Borehole Service",
    keywords: ["water pump", "borehole", "repair"],
    description:
      "Borehole pump checks, maintenance, and water access support for properties and community sites.",
  },
  {
    name: "Air Conditioner Servicing",
    category: "AC Repair",
    keywords: ["air conditioner", "hvac", "repair"],
    description:
      "Cooling system cleaning, gas checks, and repair support for homes, offices, and shops.",
  },
  {
    name: "Event Catering Support",
    category: "Catering",
    keywords: ["catering", "food service", "event"],
    description:
      "Food preparation and event catering support for birthdays, church events, and community gatherings.",
  },
  {
    name: "Mobile Money Assistance",
    category: "Mobile Money Support",
    keywords: ["mobile phone", "payment", "agent"],
    description:
      "Cash-in, cash-out, and mobile money support listings for nearby customer convenience and testing.",
  },
];

const firstNames = [
  "Aarav",
  "Vivaan",
  "Aditya",
  "Ishaan",
  "Riya",
  "Anaya",
  "Saanvi",
  "Diya",
  "Kabir",
  "Meera",
];

const lastNames = [
  "Sharma",
  "Patel",
  "Gupta",
  "Verma",
  "Singh",
  "Mehta",
  "Rao",
  "Nair",
  "Kapoor",
  "Joshi",
];

function pick(list, index) {
  return list[index % list.length];
}

function buildProviderId(index) {
  return `seed-provider-${String(index + 1).padStart(2, "0")}`;
}

function buildProvider(index) {
  const firstName = pick(firstNames, index);
  const lastName = pick(lastNames, index * 2);
  const city = pick(cities, index);
  const providerNumber = index + 1;
  const providerId = buildProviderId(index);

  return {
    _id: providerId,
    name: `${firstName} ${lastName}`,
    email: `seed.provider${providerNumber}@serviceconnect.test`,
    role: "provider",
    phone: `900000${String(providerNumber).padStart(4, "0")}`,
    accountStatus: "active",
    isApproved: true,
    approvalStatus: "approved",
    providerAddress: `${12 + providerNumber} Broad Street, ${city}, Liberia`,
    profilePhoto: `https://picsum.photos/seed/${providerId}-profile/400/400`,
  };
}

function buildImages(providerIndex, serviceIndex, imageCount) {
  return Array.from({ length: imageCount }, (_, imageIndex) => {
    const shotNumber = imageIndex + 1;
    const seed = `liberia-provider${providerIndex + 1}-service${serviceIndex + 1}-photo${shotNumber}`;
    return {
      imageUrl: `https://picsum.photos/seed/${seed}/1200/900`,
      caption: `Sample photo ${shotNumber}`,
    };
  });
}

function buildService(provider, providerIndex, serviceIndex) {
  const serviceMeta = serviceCatalog[(providerIndex * SERVICES_PER_PROVIDER + serviceIndex) % serviceCatalog.length];
  const category = serviceMeta.category || pick(categories, providerIndex + serviceIndex);
  const imageRange = MAX_IMAGES_PER_SERVICE - MIN_IMAGES_PER_SERVICE + 1;
  const imageCount = MIN_IMAGES_PER_SERVICE + ((providerIndex + serviceIndex) % imageRange);
  const price = 500 + providerIndex * 120 + serviceIndex * 75;
  const images = buildImages(providerIndex, serviceIndex, imageCount);

  return {
    serviceName: serviceMeta.name,
    category,
    description: `${serviceMeta.description} Provider: ${provider.name} in ${provider.providerAddress}. Seeded for realistic Liberia marketplace testing.`,
    price,
    availabilityStatus: serviceIndex % 4 === 0 ? "Unavailable" : "Available",
    moderationStatus: "active",
    images,
    thumbnailUrl: images[0]?.imageUrl || "",
    providerId: provider._id,
    providerName: provider.name,
    providerAddress: provider.providerAddress,
    providerProfilePhoto: provider.profilePhoto,
  };
}

async function seedProviders() {
  const hashedPassword = await bcrypt.hash(SEEDED_PROVIDER_PASSWORD, 10);
  const providers = Array.from({ length: PROVIDER_COUNT }, (_, index) => buildProvider(index));

  for (const provider of providers) {
    await User.findByIdAndUpdate(provider._id, { ...provider, password: hashedPassword }, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });
  }

  return providers;
}

async function seedServices(providers) {
  const providerIds = providers.map((provider) => provider._id);

  await Service.deleteMany({
    providerId: { $in: providerIds },
  });

  const services = [];
  providers.forEach((provider, providerIndex) => {
    for (let serviceIndex = 0; serviceIndex < SERVICES_PER_PROVIDER; serviceIndex += 1) {
      services.push(buildService(provider, providerIndex, serviceIndex));
    }
  });

  await Service.insertMany(services);
  return services.length;
}

async function main() {
  try {
    await connectDB();

    const providers = await seedProviders();
    const servicesCreated = await seedServices(providers);

    console.log(`Seed complete: ${providers.length} providers, ${servicesCreated} services created.`);
    console.log("Each service includes 5 to 10 realistic photo URLs and Liberia-based provider/service details.");
    console.log(`Provider login password: ${SEEDED_PROVIDER_PASSWORD}`);
  } catch (error) {
    console.error("Seed failed.");
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

main();
