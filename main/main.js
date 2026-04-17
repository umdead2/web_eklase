const data = localStorage.getItem("Data");
const dateDisplay = document.getElementById("date");
let currentdate = 0;
const jsonData = JSON.parse(data);
const userclass = jsonData.user?.class?.name
const globalInfo = getChangesForClass("globalInfo");


function getCurrentDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  return date.toLocaleDateString("sv-SE", {
    timeZone: "Europe/Riga"
  });
}


document.addEventListener("DOMContentLoaded", function() {
    UpdateDiary(getCurrentDate(currentdate))
    UpdateChanges(getChangesForClass(userclass))

    document.getElementById('current-class-display').innerHTML = userclass;
    document.getElementById('global-info-container').innerHTML = cleanHtml(globalInfo);
    

});
document.addEventListener("click", function (e) {
  if (!e.target.classList.contains("read-more")) return;

  e.preventDefault();

  const cell = e.target.closest("td");
  const more = cell.querySelector(".more-text");
  const dots = cell.querySelector(".dots");

  const isOpen = more.classList.contains("show");

  if (isOpen) {
    more.classList.remove("show");
    dots.classList.remove("hide");
    e.target.textContent = "Rādīt vairāk";
  } else {
    more.classList.add("show");
    dots.classList.add("hide");
    e.target.textContent = "Rādīt mazāk";
  }
});

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

function cleanHtml(html) {
if (!html) return "";
    
    return html
        .replace(/<p>&nbsp;<\/p>/g, '') // Izdzēš tukšās rindas
        .replace(/<p>\s*<\/p>/g, '')    // Izdzēš rindkopas bez teksta
        .replace(/style="[^"]*"/g, '')  // Noņem visus inline stilus (krāsas/izmērus)
        .replace(/&nbsp;/g, ' ');       // Aizstāj HTML atstarpes ar parastām
}

function formatText(html, maxLinks = 1) {
  if (!html) return "--";

  const div = document.createElement("div");
  div.innerHTML = html;

  const links = Array.from(div.querySelectorAll("a"));

  // If no links → fallback to text trimming
  if (links.length === 0) {
    const text = div.textContent.trim();
    if (text.length <= 150) return text;

    return `
      <span class="short-text">${text.slice(0, 150)}</span>
      <span class="dots">...</span>
      <span class="more-text">${text.slice(150)}</span>
      <a href="#" class="read-more">Rādīt vairāk</a>
    `;
  }

  // Split links into preview + hidden
  const visibleLinks = links.slice(0, maxLinks);
  const hiddenLinks = links.slice(maxLinks);

  const renderLinks = (arr) =>
    arr.map(a => `<a href="${a.href}" target="_blank">${a.href}</a>`).join("<br>");

  // If all links fit → no toggle needed
  if (hiddenLinks.length === 0) {
    return renderLinks(visibleLinks);
  }

  return `
    <span class="short-text">
      ${renderLinks(visibleLinks)}
    </span>
    <span class="dots">...</span>
    <span class="more-text">
      ${renderLinks(hiddenLinks)}
    </span>
    <a href="#" class="read-more">Rādīt vairāk</a>
  `;
}

function changeDate(offset) {
    currentdate += offset;
    UpdateDiary(getCurrentDate(currentdate));
}

function UpdateDiary(date) {
    
    if (!data) {
        console.log("No data in localStorage!");
        return;
    }
    
    
    const currentDate = date;
    
    let table = document.getElementById("diaryTable");

    while (table.rows.length > 1) {
        table.deleteRow(1);
    }
    dateDisplay.textContent = getCurrentDate(currentdate);
    jsonData.diary.forEach(day => {
        if (day.date.slice(0, 10) === currentDate) {
            if (day.lessons.length === 0) {
                let newRow = table.insertRow();
                let newCell = newRow.insertCell(0);
                newCell.innerHTML = "No lessons today";
            } else {
                const maxLessonNumber = Math.max(...day.lessons.map(lesson => lesson.lessonNumber));

                for (let lessonNum = 1; lessonNum <= maxLessonNumber; lessonNum++) {
                    const lesson = day.lessons.find(l => l.lessonNumber === lessonNum);
                    
                    let newRow = table.insertRow();
                    
                    let newCell1 = newRow.insertCell(0);
                    if (lesson) {
                        newCell1.innerHTML = lesson.lessonNumber;
                    } else {
                        newCell1.innerHTML = lessonNum;
                    }

                    let newCell2 = newRow.insertCell(1);
                    if (lesson) {
                        newCell2.innerHTML = `${lesson.classJournalName || "--"}<br>${lesson.roomNumber ? lesson.roomNumber + " klase" : ""} `;
                    } else {
                        newCell2.innerHTML = "--";
                    }
                    const subjectText = lesson?.lessonSubjects?.[0]?.value?.text || "";
                    const scheduledTests = lesson?.scheduledTests?.[0]?.description;
                    const scheduledTestsText = scheduledTests?.text || "";
                    
                    let newCell3 = newRow.insertCell(2);
                    if (lesson) {
                      const hasscheAttachment = (scheduledTests?.attachments?.length || 0) > 0 || (lesson?.thirdPartyEvents?.length|| 0) > 0;
                        newCell3.innerHTML = `
                        ${formatText(subjectText)}
                        ${formatText(scheduledTestsText)}
                        ${hasscheAttachment ? `
                            <div class="attachment-row">
                            <span>Saite vai fails pieejams e-klasē.</span>
                            <a href="https://family.e-klase.lv/" target="_blank" class="eklase-btn">
                                Atvērt
                            </a>
                            </div>
                        ` : ""}
                    `;
                    } else {
                        newCell3.innerHTML = "--";
                    }

                    const homeTask = lesson?.homeTasks?.[0]?.task;
                    const hometaskText = homeTask?.text || "";

                    let newCell4 = newRow.insertCell(3);

                    if (lesson) {
                    const hasAttachment = (homeTask?.attachments?.length || 0) > 0 || (lesson?.thirdPartyEvents?.length|| 0) > 0;

                    newCell4.innerHTML = `
                    ${formatText(hometaskText)}
                    ${hasAttachment ? `
                        <div class="attachment-row">
                        <span>Saite vai fails pieejams e-klasē.</span>
                        <a href="https://family.e-klase.lv/" target="_blank" class="eklase-btn">
                            Atvērt
                        </a>
                        </div>
                    ` : ""}
                    `;
                    } else {
                        newCell4.innerHTML = "--";
                    }

                    let newCell5 = newRow.insertCell(4);
                    if (lesson) {
                        newCell5.innerHTML = lesson.evaluations?.[0]?.value || "--";
                    } else {
                        newCell5.innerHTML = "--";
                    }
                }
        }
    }
    });
}

function getChangesForClass(targetClass) {
    const newsArray = Array.isArray(jsonData.news) ? jsonData.news : jsonData;

    const newsItem = newsArray.find(item => 
        item.title && item.title.toLowerCase().includes("stundu izmaiņas")
    );

    const body = newsItem ? newsItem.body : "";

    // Split by ANY bolded class name pattern
    const parts = body.split(/(<strong>\d+\.[a-z]+\s*klase<\/strong>)/i);
    const globalInfo = parts[0];

    if (targetClass === "globalInfo") {
        return globalInfo;
    }

    const cleanTarget = targetClass.toLowerCase().trim();
    
    // 1. Find the specific index for the class section
    let classIndex = -1;
    for (let i = 1; i < parts.length; i += 2) {
        const sectionHeader = parts[i].replace(/<[^>]*>/g, "").toLowerCase();
        if (sectionHeader.includes(cleanTarget)) {
            classIndex = i;
            break;
        }
    }

    // 2. Updated Regex: Matches "10.g", "10.g klase", "10.g klasēm", etc.
    // It looks for the class name followed by a boundary, space, or common Latvian endings
    const safeSearchTerm = targetClass.replace(".", "\\.");
    const classRegex = new RegExp("(^|\\s|>|\\()" + safeSearchTerm + "($|\\s|\\.|,|k)", "i");

    // Check if mentioned in Global Info OR the News Title (sometimes mentioned there)
    const mentionedInGlobal = classRegex.test(globalInfo) || (newsItem && classRegex.test(newsItem.title));

    // 3. Construct Result
    if (classIndex !== -1) {
        let result = parts[classIndex] + parts[classIndex + 1];
        
        if (mentionedInGlobal) {
            result += `<p style="margin-top: 10px; font-style: italic; color: #949ba4; border-top: 1px solid #444; padding-top: 8px;">
                        ℹ️ Skatīt skolas kopējās izmaiņas (norādītas Apakšā).
                       </p>`;
        }
        return result;
    }

    // If only mentioned in global info
    if (mentionedInGlobal) {
        return `<strong>${targetClass.toUpperCase()} KLASE</strong><br>
                <p style="color: #dbdee1;">Skatīt skolas kopējās izmaiņas (norādītas Apakšā).</p>`;
    }

    return "Nav izmaiņu šajai klasei";
}

function UpdateChanges(info) {
  document.getElementById('class-info-container').innerHTML = info;
}

const classes = [
    "1.g", "1.u", "1.l", "1.b", "1.e", "1.n",
    "2.g", "2.u", "2.l", "2.b", "2.e", "2.n",
    "3.g", "3.u", "3.l", "3.b", "3.e", "3.n",
    "4.g", "4.u", "4.l", "4.b", "4.e", "4.n",
    "5.g", "5.u", "5.l", "5.b", "5.e", "5.n",
    "6.g", "6.u", "6.l", "6.b", "6.e", "6.n",
    "7.g", "7.u", "7.l", "7.b", "7.e", "7.n",
    "8.g", "8.u", "8.l", "8.b", "8.e", "8.n",
    "9.g", "9.u", "9.l", "9.b", "9.e", "9.n",
    "10.g","10.bg", "11.g", "11.bu","12.u","12.b",

];
const dropdown = document.getElementById("classDropdown");
const input = document.getElementById("classSearch");
const displayTitle = document.getElementById("current-class-display");

function showDropdown(list) {
    dropdown.innerHTML = "";
    list.forEach(cls => {
        const div = document.createElement("div");
        div.textContent = cls;
        div.onclick = () => {
            selectClass(cls);
        };
        dropdown.appendChild(div);
    });
    dropdown.style.display = list.length ? "block" : "none";
}

function selectClass(cls) {
    input.value = ""; // Notīrām inputu pēc izvēles
    dropdown.style.display = "none";
    displayTitle.textContent = cls.toUpperCase() + " klase"; // Atjaunojam lielo virsrakstu
    console.log(cls)
    UpdateChanges(getChangesForClass(cls))
    // Šeit izsaucam tavas funkcijas, lai pārlādētu datus
    if (typeof renderNews === "function") {
        renderNews(cls); 
    }
}

function filterClasses() {
    const value = input.value.toLowerCase();
    const filtered = classes.filter(c => c.toLowerCase().includes(value));
    showDropdown(filtered);
}

input.addEventListener("input", filterClasses);
input.addEventListener("focus", () => showDropdown(classes));

// Aizver dropdown, ja noklikšķina citur
document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-section")) {
        dropdown.style.display = "none";
    }
});