const data = localStorage.getItem("Data");
const dateDisplay = document.getElementById("date");
let currentdate = 0;

function getCurrentDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  return date.toLocaleDateString("sv-SE", {
    timeZone: "Europe/Riga"
  });
}


document.addEventListener("DOMContentLoaded", function() {
    UpdateDiary(getCurrentDate(currentdate))
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

function formatText(text, maxWords = 20) {
  if (!text) return "--";

  const clean = stripHtml(text);
  const words = clean.split(" ");

  if (words.length <= maxWords) return clean;

  const shortText = words.slice(0, maxWords).join(" ");
  const restText = words.slice(maxWords).join(" ");

  return `
    <span class="short-text">${shortText}</span>
    <span class="dots">...</span>
    <span class="more-text">${restText}</span>
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
    
    const jsonData = JSON.parse(data);
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
                    let newCell3 = newRow.insertCell(2);
                    if (lesson) {
                        newCell3.innerHTML = formatText(subjectText);
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
                        <br>
                        Saite vai fails pieejams e-klasē.
                        <a href="https://family.e-klase.lv/" target="_blank">
                            <button class="eklase-btn">Atvērt</button>
                        </a>
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