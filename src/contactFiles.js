function unescapeVCard(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\([\\,;:])/g, "$1");
}

function splitEscaped(value, separator) {
  const parts = [];
  let part = "";
  let escaped = false;
  for (const character of String(value || "")) {
    if (escaped) {
      part += `\\${character}`;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === separator) {
      parts.push(part);
      part = "";
    } else {
      part += character;
    }
  }
  if (escaped) part += "\\";
  parts.push(part);
  return parts;
}

function decodeQuotedPrintable(value) {
  const encoded = String(value || "").replace(/=([0-9a-f]{2})/gi, "%$1");
  try {
    return decodeURIComponent(encoded);
  } catch {
    return String(value || "").replace(/=([0-9a-f]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  }
}

function decodeVCardValue(value, header) {
  const decoded = /ENCODING="?QUOTED-PRINTABLE"?/i.test(header)
    ? decodeQuotedPrintable(value)
    : value;
  return unescapeVCard(decoded);
}

function normalizePhoneLabel(label) {
  const value = String(label || "").toLowerCase();
  if (value.includes("cell") || value.includes("mobile")) return "mobile";
  if (value.includes("home")) return "home";
  if (value.includes("work")) return "work";
  if (value.includes("fax")) return "fax";
  return value ? "other" : "mobile";
}

function vCardPhoneType(label) {
  const value = String(label || "").toLowerCase();
  if (value.includes("mobile") || value.includes("cell")) return "CELL";
  if (value.includes("home")) return "HOME";
  if (value.includes("work")) return "WORK";
  if (value.includes("fax")) return "FAX";
  return "VOICE";
}

function vCardLines(text) {
  const physicalLines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/=\n/g, "")
    .split("\n");
  const lines = [];
  for (const line of physicalLines) {
    if (/^[ \t]/.test(line) && lines.length)
      lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  return lines;
}

function parseVCard(text) {
  const cards = [];
  let current = null;
  for (const line of vCardLines(text)) {
    if (/^BEGIN:VCARD/i.test(line.trim())) {
      current = [];
    } else if (/^END:VCARD/i.test(line.trim())) {
      if (current) cards.push(current);
      current = null;
    } else if (current) {
      current.push(line);
    }
  }

  return cards
    .map((lines) => {
      const fields = { phoneNumbers: [], emails: [], addresses: [] };
      let structuredName = [];
      for (const line of lines) {
        const colon = line.indexOf(":");
        if (colon < 0) continue;
        const header = line.slice(0, colon);
        const property = (
          header.split(";")[0].split(".").pop() || ""
        ).toUpperCase();
        const rawValue = line.slice(colon + 1);
        const type = /(?:^|;)TYPE="?([^";]+)/i.exec(header)?.[1]?.split(",")[0];
        const value = decodeVCardValue(rawValue, header).trim();
        if (property === "FN") fields.name = value;
        else if (property === "N") {
          structuredName = splitEscaped(rawValue, ";").map((part) =>
            decodeVCardValue(part, header).trim(),
          );
        } else if (property === "TEL" && value) {
          const number = value.replace(/^tel:/i, "");
          if (number)
            fields.phoneNumbers.push({
              label: normalizePhoneLabel(type),
              number,
            });
        } else if (property === "EMAIL" && value) {
          fields.emails.push({
            label: String(type || "home").toLowerCase(),
            email: value,
          });
        } else if (property === "ORG" && value) {
          fields.company = splitEscaped(rawValue, ";")
            .map((part) => decodeVCardValue(part, header).trim())
            .filter(Boolean)[0];
        } else if (property === "TITLE" && value) {
          fields.jobTitle = value;
        } else if (property === "NOTE" && value) {
          fields.note = value;
        } else if (property === "BDAY" && value) {
          const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value);
          if (match)
            fields.birthday = new Date(
              Number(match[1]),
              Number(match[2]) - 1,
              Number(match[3]),
            );
        } else if (property === "URL" && value) {
          if (!fields.urlAddresses) fields.urlAddresses = [];
          fields.urlAddresses.push({
            label: String(type || "other").toLowerCase(),
            url: value,
          });
        } else if (property === "ADR" && value) {
          const parts = splitEscaped(rawValue, ";").map((part) =>
            decodeVCardValue(part, header).trim(),
          );
          const address = {
            label: String(type || "other").toLowerCase(),
            street: [parts[2], parts[1], parts[0]].filter(Boolean).join(", "),
            city: parts[3],
            region: parts[4],
            postalCode: parts[5],
            country: parts[6],
          };
          if (
            Object.values(address).some(
              (item) => item && item !== address.label,
            )
          )
            fields.addresses.push(address);
        }
      }

      const [lastName, firstName, middleName, namePrefix, nameSuffix] =
        structuredName;
      if (firstName) fields.firstName = firstName;
      if (lastName) fields.lastName = lastName;
      if (middleName) fields.middleName = middleName;
      if (namePrefix) fields.namePrefix = namePrefix;
      if (nameSuffix) fields.nameSuffix = nameSuffix;
      const composedName = [
        namePrefix,
        firstName,
        middleName,
        lastName,
        nameSuffix,
      ]
        .filter(Boolean)
        .join(" ");
      fields.name =
        fields.name ||
        composedName ||
        fields.company ||
        fields.phoneNumbers[0]?.number ||
        fields.emails[0]?.email;
      fields.contactType = "person";
      if (!fields.phoneNumbers.length) delete fields.phoneNumbers;
      if (!fields.emails.length) delete fields.emails;
      if (!fields.addresses.length) delete fields.addresses;
      if (!fields.urlAddresses?.length) delete fields.urlAddresses;
      if (!fields.name && !fields.company) return null;
      return fields;
    })
    .filter(Boolean);
}

function parseCsvRows(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const headerLine = source.split(/\r?\n/).find((line) => line.trim()) || "";
  const delimiterCounts = [",", ";", "\t"].map((delimiter) => {
    let count = 0;
    let quoted = false;
    for (let index = 0; index < headerLine.length; index += 1) {
      if (headerLine[index] === '"') {
        if (quoted && headerLine[index + 1] === '"') index += 1;
        else quoted = !quoted;
      } else if (!quoted && headerLine[index] === delimiter) count += 1;
    }
    return { delimiter, count };
  });
  const delimiter =
    delimiterCounts.sort((a, b) => b.count - a.count)[0]?.delimiter || ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some((value) => value)) rows.push(row);
  return rows;
}

function normalizedHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findHeader(headers, candidates) {
  const keys = headers.map(normalizedHeader);
  for (const candidate of candidates) {
    const index = keys.indexOf(candidate);
    if (index >= 0) return index;
  }
  return -1;
}

function parseBirthday(value) {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(
    String(value || "").trim(),
  );
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const keys = headers.map(normalizedHeader);
  const firstNameIndex = findHeader(headers, [
    "firstname",
    "givenname",
    "first",
  ]);
  const middleNameIndex = findHeader(headers, [
    "middlename",
    "additionalname",
    "middle",
  ]);
  const lastNameIndex = findHeader(headers, [
    "lastname",
    "familyname",
    "surname",
    "last",
  ]);
  const prefixIndex = findHeader(headers, ["nameprefix", "prefix"]);
  const suffixIndex = findHeader(headers, ["namesuffix", "suffix"]);
  const displayNameIndex = findHeader(headers, [
    "name",
    "fullname",
    "displayname",
    "formattedname",
  ]);
  const companyIndex = findHeader(headers, [
    "company",
    "organization",
    "organization1name",
    "org",
  ]);
  const titleIndex = findHeader(headers, [
    "jobtitle",
    "organization1title",
    "title",
  ]);
  const birthdayIndex = findHeader(headers, [
    "birthday",
    "bday",
    "dateofbirth",
  ]);
  const noteIndex = findHeader(headers, ["notes", "note", "comments"]);

  const phoneIndexes = keys
    .map((key, index) => ({ key, index }))
    .filter(
      ({ key }) =>
        /^(phone|telephone|tel)\d*(value)?$/.test(key) ||
        /^(mobile|cell|homephone|workphone|businessphone|otherphone)\d*$/.test(
          key,
        ),
    );
  const emailIndexes = keys
    .map((key, index) => ({ key, index }))
    .filter(
      ({ key }) =>
        /^(email|mail)\d*(address|value)?$/.test(key) ||
        /^(primaryemail|secondaryemail|workemail|homeemail)$/.test(key),
    );
  const addressIndexes = new Map();
  keys.forEach((key, index) => {
    const match =
      /^address(\d+)(type|street|city|region|state|postalcode|zip|country|formatted|extendedaddress|pobox)$/.exec(
        key,
      );
    if (!match) return;
    const number = match[1] || "1";
    if (!addressIndexes.has(number)) addressIndexes.set(number, {});
    addressIndexes.get(number)[match[2]] = index;
  });

  return rows
    .slice(1)
    .map((row) => {
      const get = (index) =>
        index >= 0 ? String(row[index] || "").trim() : "";
      const contact = { contactType: "person" };
      const firstName = get(firstNameIndex);
      const middleName = get(middleNameIndex);
      const lastName = get(lastNameIndex);
      const namePrefix = get(prefixIndex);
      const nameSuffix = get(suffixIndex);
      const displayName = get(displayNameIndex);
      if (firstName) contact.firstName = firstName;
      if (middleName) contact.middleName = middleName;
      if (lastName) contact.lastName = lastName;
      if (namePrefix) contact.namePrefix = namePrefix;
      if (nameSuffix) contact.nameSuffix = nameSuffix;
      contact.name =
        displayName ||
        [namePrefix, firstName, middleName, lastName, nameSuffix]
          .filter(Boolean)
          .join(" ");
      if (get(companyIndex)) contact.company = get(companyIndex);
      if (get(titleIndex)) contact.jobTitle = get(titleIndex);
      if (get(birthdayIndex))
        contact.birthday = parseBirthday(get(birthdayIndex));
      if (get(noteIndex)) contact.note = get(noteIndex);

      const phoneNumbers = phoneIndexes
        .map(({ key, index }) => {
          const number = get(index);
          if (!number) return null;
          const base = key.replace(/(value|address)$/, "");
          const typeIndex = keys.indexOf(`${base}type`);
          const type =
            get(typeIndex) ||
            (/mobile|cell/.test(key)
              ? "mobile"
              : /home/.test(key)
                ? "home"
                : /work|business/.test(key)
                  ? "work"
                  : "other");
          return { label: normalizePhoneLabel(type), number };
        })
        .filter(Boolean);
      if (phoneNumbers.length) contact.phoneNumbers = phoneNumbers;

      const emails = emailIndexes
        .map(({ key, index }) => {
          const email = get(index);
          if (!email) return null;
          const base = key.replace(/(value|address)$/, "");
          const typeIndex = keys.indexOf(`${base}type`);
          return { label: get(typeIndex) || "home", email };
        })
        .filter(Boolean);
      if (emails.length) contact.emails = emails;

      const addresses = [...addressIndexes.values()]
        .map((indexes) => {
          const address = {
            label: get(indexes.type) || "other",
            street:
              [
                get(indexes.pobox),
                get(indexes.extendedaddress),
                get(indexes.street),
              ]
                .filter(Boolean)
                .join(", ") || get(indexes.formatted),
            city: get(indexes.city),
            region: get(indexes.region) || get(indexes.state),
            postalCode: get(indexes.postalcode) || get(indexes.zip),
            country: get(indexes.country),
          };
          return Object.values(address).some(
            (value) => value && value !== address.label,
          )
            ? address
            : null;
        })
        .filter(Boolean);
      if (addresses.length) contact.addresses = addresses;

      if (!contact.name)
        contact.name =
          contact.company || phoneNumbers[0]?.number || emails[0]?.email || "";
      if (
        !contact.name &&
        !contact.company &&
        !phoneNumbers.length &&
        !emails.length
      )
        return null;
      return contact;
    })
    .filter(Boolean);
}

function escapeVCard(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function fullContactName(contact) {
  return String(
    contact.name ||
      [
        contact.namePrefix,
        contact.firstName,
        contact.middleName,
        contact.lastName,
        contact.nameSuffix,
      ]
        .filter(Boolean)
        .join(" ") ||
      contact.company ||
      "",
  ).trim();
}

function birthdayString(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  if (typeof value === "object" && value.month && value.day) {
    const year = value.year || 2000;
    return `${String(year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
  }
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(String(value));
  return match
    ? `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`
    : "";
}

export function contactsToVCard(contacts) {
  return contacts
    .map((contact) => {
      const first = contact.firstName || "";
      const last = contact.lastName || "";
      const name = fullContactName(contact);
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${escapeVCard(last)};${escapeVCard(first)};${escapeVCard(contact.middleName)};${escapeVCard(contact.namePrefix)};${escapeVCard(contact.nameSuffix)}`,
        `FN:${escapeVCard(name)}`,
      ];
      for (const phone of contact.phoneNumbers || []) {
        if (phone.number)
          lines.push(
            `TEL;TYPE=${vCardPhoneType(phone.label)}:${escapeVCard(phone.number)}`,
          );
      }
      for (const email of contact.emails || []) {
        if (email.email)
          lines.push(
            `EMAIL;TYPE=${String(email.label || "INTERNET").toUpperCase()}:${escapeVCard(email.email)}`,
          );
      }
      if (contact.company) lines.push(`ORG:${escapeVCard(contact.company)}`);
      if (contact.jobTitle)
        lines.push(`TITLE:${escapeVCard(contact.jobTitle)}`);
      if (contact.note) lines.push(`NOTE:${escapeVCard(contact.note)}`);
      const birthday = birthdayString(contact.birthday);
      if (birthday) lines.push(`BDAY:${birthday.replace(/-/g, "")}`);
      for (const address of contact.addresses || []) {
        const street = escapeVCard(address.street);
        const city = escapeVCard(address.city);
        const region = escapeVCard(address.region);
        const postalCode = escapeVCard(address.postalCode);
        const country = escapeVCard(address.country);
        if ([street, city, region, postalCode, country].some(Boolean)) {
          const type = String(address.label || "other").toUpperCase();
          lines.push(
            `ADR;TYPE=${type}:;;${street};${city};${region};${postalCode};${country}`,
          );
        }
      }
      for (const link of contact.urlAddresses || []) {
        if (link.url) lines.push(`URL:${escapeVCard(link.url)}`);
      }
      lines.push("END:VCARD");
      return lines.join("\r\n");
    })
    .join("\r\n");
}

function csvCell(value) {
  const text = String(value || "");
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function contactsToCsv(contacts) {
  const maxPhones = contacts.reduce(
    (max, contact) => Math.max(max, (contact.phoneNumbers || []).length),
    1,
  );
  const maxEmails = contacts.reduce(
    (max, contact) => Math.max(max, (contact.emails || []).length),
    1,
  );
  const maxAddresses = contacts.reduce(
    (max, contact) => Math.max(max, (contact.addresses || []).length),
    1,
  );
  const headers = [
    "First Name",
    "Middle Name",
    "Last Name",
    "Name Prefix",
    "Name Suffix",
    "Name",
    "Birthday",
    "Organization 1 - Name",
    "Organization 1 - Title",
    "Notes",
  ];
  for (let index = 1; index <= maxPhones; index += 1)
    headers.push(`Phone ${index} - Type`, `Phone ${index} - Value`);
  for (let index = 1; index <= maxEmails; index += 1)
    headers.push(`E-mail ${index} - Type`, `E-mail ${index} - Value`);
  for (let index = 1; index <= maxAddresses; index += 1) {
    headers.push(
      `Address ${index} - Type`,
      `Address ${index} - Street`,
      `Address ${index} - City`,
      `Address ${index} - Region`,
      `Address ${index} - Postal Code`,
      `Address ${index} - Country`,
    );
  }
  const rows = contacts.map((contact) => {
    const row = [
      contact.firstName,
      contact.middleName,
      contact.lastName,
      contact.namePrefix,
      contact.nameSuffix,
      fullContactName(contact),
      birthdayString(contact.birthday),
      contact.company,
      contact.jobTitle,
      contact.note,
    ];
    for (let index = 0; index < maxPhones; index += 1) {
      const phone = (contact.phoneNumbers || [])[index] || {};
      row.push(phone.label, phone.number);
    }
    for (let index = 0; index < maxEmails; index += 1) {
      const email = (contact.emails || [])[index] || {};
      row.push(email.label, email.email);
    }
    for (let index = 0; index < maxAddresses; index += 1) {
      const address = (contact.addresses || [])[index] || {};
      row.push(
        address.label,
        address.street,
        address.city,
        address.region,
        address.postalCode,
        address.country,
      );
    }
    return row.map(csvCell).join(",");
  });
  return `\uFEFF${[headers.map(csvCell).join(","), ...rows].join("\r\n")}`;
}

export function parseContactsFile(filename, mimeType, content) {
  const name = String(filename || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  if (name.endsWith(".vcf") || mime.includes("vcard"))
    return parseVCard(content);
  if (
    name.endsWith(".csv") ||
    mime.includes("csv") ||
    mime.includes("comma-separated")
  )
    return parseCsv(content);
  throw new Error("Choose a .vcf or .csv contacts file.");
}
