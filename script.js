(() => {
    "use strict";

    const RECORDS_KEY = "gatecheck.records";
    const PAGE_TITLES = {
        dashboard: "Dashboard",
        scanner: "QR Scanner",
        nfc: "NFC Scanner",
        records: "Attendance Records"
    };

    const elements = {
        pageTitle: document.getElementById("page-title"),
        currentDate: document.getElementById("current-date"),
        currentlyIn: document.getElementById("currently-in"),
        todayRecords: document.getElementById("today-records"),
        recentRecords: document.getElementById("recent-records"),
        recordsList: document.getElementById("records-list"),
        scanResult: document.getElementById("scan-result"),
        nfcResult: document.getElementById("nfc-result"),
        scanModeSign: document.getElementById("scan-mode-sign"),
        scanModeInputs: [...document.querySelectorAll('input[name="scan-mode"]')],
        nfcStartButton: document.getElementById("nfc-start-button"),
        nfcStatus: document.getElementById("nfc-status"),
        recordSearch: document.getElementById("record-search"),
        recordDate: document.getElementById("record-date"),
        exportButton: document.getElementById("export-csv"),
        shareDialog: document.getElementById("share-dialog"),
        shareButton: document.getElementById("share-csv-button"),
        dismissShareButton: document.getElementById("dismiss-share-button"),
        shareStatus: document.getElementById("share-status"),
        navButtons: [...document.querySelectorAll(".nav-btn")],
        pages: [...document.querySelectorAll(".page")]
    };

    const failedStorageKeys = new Set();
    let records = loadCollection(RECORDS_KEY, isRecord);
    let qrScanner = null;
    let lastQrCode = "";
    let lastQrScanAt = 0;
    let scanMode = "in";
    let nfcReader = null;
    let nfcAbortController = null;
    let lastNfcCode = "";
    let lastNfcReadAt = 0;
    let pendingShareFile = null;

    function createSampleRecord() {
        const today = new Date();
        const atHour = hour => new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
            hour
        ).toISOString();

        return {
            employeeCode: "SAMPLE-001",
            employeeName: "Jhunver Pilar",
            date: localDateKey(today),
            timeIn: atHour(8),
            timeOut: atHour(17)
        };
    }

    function loadCollection(key, isValidItem) {
        try {
            const stored = localStorage.getItem(key);
            if (stored === null) return [createSampleRecord()];

            const value = JSON.parse(stored);
            if (!Array.isArray(value) || !value.every(isValidItem)) {
                throw new Error(`Saved data for ${key} is invalid.`);
            }
            return value;
        } catch (error) {
            failedStorageKeys.add(key);
            showNotice(`Unable to load saved attendance data: ${error.message}`);
            return [];
        }
    }

    function isRecord(value) {
        return value !== null
            && typeof value === "object"
            && typeof value.employeeCode === "string"
            && typeof value.employeeName === "string"
            && typeof value.date === "string"
            && typeof value.timeIn === "string"
            && (value.timeOut === null || typeof value.timeOut === "string");
    }

    function saveCollection(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            failedStorageKeys.delete(key);
            return true;
        } catch (error) {
            showNotice(`Unable to save changes in this browser: ${error.message}`);
            return false;
        }
    }

    function showNotice(message) {
        let notice = document.getElementById("app-notice");
        if (!notice) {
            notice = document.createElement("p");
            notice.id = "app-notice";
            notice.setAttribute("role", "alert");
            document.querySelector(".main-content").prepend(notice);
        }
        notice.textContent = message;
    }

    function clearNotice() {
        if (failedStorageKeys.size) return;
        document.getElementById("app-notice")?.remove();
    }

    function localDateKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function formatTime(value) {
        if (!value) return "—";
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? "—"
            : date.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
                hour12: true
            });
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function renderEmptyRow(columnCount, message) {
        return `<tr><td class="empty-state" colspan="${columnCount}">${escapeHtml(message)}</td></tr>`;
    }

    function recordStatus(record) {
        return record.timeOut
            ? '<span class="status status-out">Timed Out</span>'
            : '<span class="status status-in">Timed In</span>';
    }

    function renderDashboard() {
        const today = localDateKey();
        const todayRecords = records.filter(record => record.date === today);
        elements.currentlyIn.textContent = records.filter(record => !record.timeOut).length;
        elements.todayRecords.textContent = todayRecords.length;

        const recent = [...records]
            .sort((a, b) => new Date(b.timeIn) - new Date(a.timeIn))
            .slice(0, 8);
        elements.recentRecords.innerHTML = recent.length
            ? recent.map(record => `
                <tr>
                    <td>${escapeHtml(record.employeeCode)}</td>
                    <td>${escapeHtml(record.employeeName)}</td>
                    <td>${formatTime(record.timeIn)}</td>
                    <td>${formatTime(record.timeOut)}</td>
                    <td>${recordStatus(record)}</td>
                </tr>
            `).join("")
            : renderEmptyRow(5, "No attendance records yet.");
    }

    function filteredRecords() {
        const query = elements.recordSearch.value.trim().toLocaleLowerCase();
        const date = elements.recordDate.value;

        return [...records]
            .filter(record => !date || record.date === date)
            .filter(record => !query
                || record.employeeCode.toLocaleLowerCase().includes(query)
                || record.employeeName.toLocaleLowerCase().includes(query))
            .sort((a, b) => new Date(b.timeIn) - new Date(a.timeIn));
    }

    function renderRecords() {
        const visibleRecords = filteredRecords();
        elements.recordsList.innerHTML = visibleRecords.length
            ? visibleRecords.map(record => `
                <tr>
                    <td>${escapeHtml(record.date)}</td>
                    <td>${escapeHtml(record.employeeCode)}</td>
                    <td>${escapeHtml(record.employeeName)}</td>
                    <td>${formatTime(record.timeIn)}</td>
                    <td>${formatTime(record.timeOut)}</td>
                    <td>${recordStatus(record)}</td>
                </tr>
            `).join("")
            : renderEmptyRow(6, "No matching attendance records.");
    }

    function render() {
        renderDashboard();
        renderRecords();
    }

    function showPage(pageId) {
        if (!Object.hasOwn(PAGE_TITLES, pageId)) return;

        elements.pages.forEach(page => {
            page.classList.toggle("active", page.id === pageId);
        });
        elements.navButtons.forEach(button => {
            const active = button.dataset.page === pageId;
            button.classList.toggle("active", active);
            if (active) button.setAttribute("aria-current", "page");
            else button.removeAttribute("aria-current");
        });
        elements.pageTitle.textContent = PAGE_TITLES[pageId];
        if (pageId === "scanner") startQrScanner();
        else stopQrScanner();

        if (pageId === "nfc") {
            if (!nfcAbortController) startNfcScanning();
        } else stopNfcScanning();
    }

    function updateScanMode(mode) {
        scanMode = mode;
        elements.scanModeInputs.forEach(input => {
            input.checked = input.value === mode;
        });
        elements.scanModeSign.textContent =
            `Selected action: ${mode === "in" ? "Time In" : "Time Out"}`;
    }

    function processScan(rawCode, requestedMode = scanMode, resultElement = elements.scanResult) {
        const code = rawCode.trim().toLocaleUpperCase();
        if (!code) {
            showScanResult("The scanned code does not contain an employee code.", false, requestedMode, resultElement);
            return;
        }

        const now = new Date();
        const openRecord = [...records]
            .reverse()
            .find(record => record.employeeCode.toLocaleUpperCase() === code && !record.timeOut);
        const action = requestedMode === "auto"
            ? (openRecord ? "out" : "in")
            : requestedMode;
        if (action === "in" && openRecord) {
            showScanResult(`${code} is already timed in. Select Time Out to record departure.`, false, action, resultElement);
            return;
        }
        if (action === "out" && !openRecord) {
            showScanResult(`${code} is not currently timed in. Select Time In to record arrival.`, false, action, resultElement);
            return;
        }

        const employeeName = openRecord?.employeeName
            ?? [...records].reverse().find(record =>
                record.employeeCode.toLocaleUpperCase() === code
            )?.employeeName
            ?? code;
        let nextRecords;
        let message;

        if (action === "out") {
            nextRecords = records.map(record => record === openRecord
                ? { ...record, timeOut: now.toISOString() }
                : record);
            message = `${employeeName} timed out at ${formatTime(now.toISOString())}.`;
        } else {
            nextRecords = [...records, {
                employeeCode: code,
                employeeName,
                date: localDateKey(now),
                timeIn: now.toISOString(),
                timeOut: null
            }];
            message = `${employeeName} timed in at ${formatTime(now.toISOString())}.`;
        }

        records = nextRecords;
        const saved = saveCollection(RECORDS_KEY, records);
        render();
        showScanResult(message, true, action, resultElement);
        if (saved) clearNotice();
    }

    function showScanResult(message, success, action = scanMode, resultElement = elements.scanResult) {
        resultElement.textContent = message;
        const timeIn = success && action === "in";
        resultElement.style.backgroundColor = timeIn ? "#dcfce7" : "#fee2e2";
        resultElement.style.color = timeIn ? "#166534" : "#991b1b";
    }

    function decodeNfcEmployeeCode(message) {
        const textRecord = message.records.find(record => record.recordType === "text");
        if (!textRecord || !textRecord.data) return "";

        const bytes = new Uint8Array(textRecord.data);
        if (bytes.length === 0) return "";
        const languageLength = bytes[0] & 0x3f;
        return new TextDecoder().decode(bytes.subarray(1 + languageLength)).trim();
    }

    async function startNfcScanning() {
        if (nfcAbortController) {
            stopNfcScanning();
            return;
        }
        if (!("NDEFReader" in window)) {
            elements.nfcStatus.textContent =
                "NFC scanning is not supported in this browser or device. Use a supported Android browser over HTTPS.";
            return;
        }

        nfcReader = new NDEFReader();
        nfcAbortController = new AbortController();
        nfcReader.addEventListener("reading", event => {
            const code = decodeNfcEmployeeCode(event.message);
            if (!code) {
                showScanResult("This NFC tag has no employee code text record.", false, "auto", elements.nfcResult);
                return;
            }

            const now = Date.now();
            if (code.toLocaleUpperCase() === lastNfcCode && now - lastNfcReadAt < 2500) return;
            lastNfcCode = code.toLocaleUpperCase();
            lastNfcReadAt = now;
            processScan(code, "auto", elements.nfcResult);
        });
        nfcReader.addEventListener("readingerror", () => {
            elements.nfcStatus.textContent =
                "Could not read this NFC tag. Check that it contains an employee code text record.";
        });

        try {
            await nfcReader.scan({ signal: nfcAbortController.signal });
            elements.nfcStatus.textContent = "NFC scanning is active. Tap an employee tag.";
            elements.nfcStartButton.textContent = "Stop NFC Scanning";
        } catch (error) {
            nfcReader = null;
            nfcAbortController = null;
            elements.nfcStatus.textContent = `Unable to start NFC scanning: ${error.message}`;
        }
    }

    function stopNfcScanning() {
        if (nfcAbortController) {
            nfcAbortController.abort();
        }
        nfcReader = null;
        nfcAbortController = null;
        elements.nfcStatus.textContent = "NFC scanning is stopped.";
        elements.nfcStartButton.textContent = "Start NFC Scanning";
    }

    function startQrScanner() {
        if (qrScanner) return;
        const reader = document.getElementById("qr-reader");
        if (typeof Html5QrcodeScanner === "undefined") {
            reader.textContent = "QR scanner could not be loaded. Check your connection and reload the page.";
            return;
        }

        qrScanner = new Html5QrcodeScanner("qr-reader", {
            fps: 10,
            qrbox: { width: 250, height: 250 }
        }, false);
        qrScanner.render(decodedText => {
            const now = Date.now();
            if (decodedText === lastQrCode && now - lastQrScanAt < 3000) return;
            lastQrCode = decodedText;
            lastQrScanAt = now;
            processScan(decodedText);
        }, () => {});
    }

    function stopQrScanner() {
        if (!qrScanner) return;
        const scanner = qrScanner;
        qrScanner = null;
        scanner.clear().catch(error => {
            showNotice(`Unable to stop the QR scanner: ${error.message}`);
        });
    }

    function exportCsv() {
        const rows = [
            ["Date", "Employee Code", "Name", "Time In", "Time Out", "Status"],
            ...filteredRecords().map(record => [
                record.date,
                record.employeeCode,
                record.employeeName,
                formatTime(record.timeIn),
                formatTime(record.timeOut),
                record.timeOut ? "Timed Out" : "Timed In"
            ])
        ];
        const csv = rows.map(row => row.map(value => {
            const safeValue = /^[=+\-@]/.test(String(value)) ? `'${value}` : value;
            return `"${String(safeValue).replace(/"/g, '""')}"`;
        }).join(",")).join("\r\n");
        const filename = `attendance-records-${localDateKey()}.csv`;
        const blob = new Blob(["\uFEFF", csv], {
            type: "text/csv;charset=utf-8"
        });
        pendingShareFile = new File([blob], filename, { type: blob.type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        elements.shareStatus.textContent = "";
        elements.shareDialog.showModal();
    }

    async function shareCsv() {
        if (!pendingShareFile) {
            elements.shareStatus.textContent = "Export the CSV again before sharing it.";
            return;
        }

        const shareData = { files: [pendingShareFile], title: "Attendance records" };
        if (typeof navigator.share !== "function"
            || typeof navigator.canShare !== "function"
            || !navigator.canShare(shareData)) {
            elements.shareStatus.textContent =
                "File sharing is not supported in this browser. You can share the downloaded CSV from your device.";
            return;
        }

        try {
            await navigator.share(shareData);
            elements.shareDialog.close();
        } catch (error) {
            if (error.name === "AbortError") {
                elements.shareStatus.textContent = "Sharing was cancelled.";
                return;
            }
            elements.shareStatus.textContent = `Unable to share the CSV file: ${error.message}`;
        }
    }

    elements.navButtons.forEach(button => {
        button.addEventListener("click", () => showPage(button.dataset.page));
    });
    elements.nfcStartButton.addEventListener("click", startNfcScanning);
    elements.scanModeInputs.forEach(input => {
        input.addEventListener("change", () => {
            if (!input.checked) return;
            updateScanMode(input.value);
            elements.scanResult.textContent = "";
        });
    });
    elements.recordSearch.addEventListener("input", renderRecords);
    elements.recordDate.addEventListener("change", renderRecords);
    elements.exportButton.addEventListener("click", exportCsv);
    elements.shareButton.addEventListener("click", shareCsv);
    elements.dismissShareButton.addEventListener("click", () => {
        elements.shareDialog.close();
    });

    elements.currentDate.textContent = new Date().toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });
    render();
})();