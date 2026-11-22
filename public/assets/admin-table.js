// public/assets/admin-table.js
//
// Shared logic for admin/index.html (active records) and admin/archive.html
// (archived records): a sortable, filterable table, plus an overlay card that
// holds the full record and every action (rate, notes, close/archive,
// un-archive, delete permanently). Usage: x-data="adminApp('active')" or
// x-data="adminApp('archived')". Needs supabaseClient (supabase-client.js) and
// Alpine.js.

// ── Copy that still needs wording ───────────────────────────────────────
const ADMIN_ERROR_COPY = "That didn't save. Check your connection and try again.";
const ADMIN_DELETED_COPY = "Deleted.";

// Must match the options on seeker-form.html and the check constraint in
// supabase/schema.sql.
const WORK_PREFERENCE_OPTIONS = [
  { value: "remote_only", label: "Remote only" },
  { value: "remote_or_local", label: "Open to remote or local" },
  { value: "open_to_relocation", label: "Open to relocation" },
  { value: "open_to_anything", label: "Open to anything (remote, local, or relocation)" },
  { value: "local_only", label: "Local only" }
];

const RATING_FILTER_OPTIONS = [
  { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" },
  { value: "4", label: "4" }, { value: "5", label: "5" }, { value: "unrated", label: "Unrated" }
];

const TABLES = { seekers: "job_seekers", hiring: "hiring_contacts" };

function workPreferenceLabel(value) {
  const match = WORK_PREFERENCE_OPTIONS.find((o) => o.value === value);
  return match ? match.label : (value || "");
}

// Only http(s) links are rendered as links (submitted URLs aren't validated server-side).
function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "#";
  } catch (e) {
    return "#";
  }
}

function linkHost(url) {
  try { return new URL(url).hostname || url; } catch (e) { return url || ""; }
}

function adminColumns(kind, mode) {
  const columns = kind === "seekers"
    ? [
        { key: "name", label: "Name", type: "text" },
        { key: "location", label: "Location", type: "text" },
        { key: "work_preference", label: "Work preference", type: "pref" },
        { key: "rating", label: "Rating", type: "number" },
        { key: "submitted_at", label: "Submitted", type: "date" }
      ]
    : [
        { key: "name", label: "Name", type: "text" },
        { key: "email", label: "Email", type: "text" },
        { key: "jd_url", label: "Job description", type: "link" },
        { key: "submitted_at", label: "Submitted", type: "date" }
      ];
  if (mode === "archived") {
    columns.push(
      { key: "closed_at", label: "Closed", type: "date" },
      { key: "helped_facilitate", label: "Helped facilitate", type: "bool" }
    );
  }
  return columns;
}

// Every field of a record, in display order (overlay card).
function adminDetailFields(kind, mode) {
  const fields = kind === "seekers"
    ? [
        { key: "linkedin_url", label: "LinkedIn", type: "url" },
        { key: "location", label: "Location", type: "text" },
        { key: "work_preference", label: "Work preference", type: "pref" },
        { key: "relationship_note", label: "How we know each other", type: "text" },
        { key: "notes", label: "Notes", type: "text" },
        { key: "submitted_at", label: "Submitted", type: "date" }
      ]
    : [
        { key: "email", label: "Email", type: "text" },
        { key: "jd_url", label: "Job description", type: "url" },
        { key: "notes", label: "Notes", type: "text" },
        { key: "submitted_at", label: "Submitted", type: "date" }
      ];
  if (mode === "archived") {
    fields.push(
      { key: "closed_at", label: "Closed", type: "date" },
      { key: "helped_facilitate", label: "Helped facilitate", type: "bool" }
    );
  }
  return fields;
}

function adminApp(mode) {
  return {
    mode, // "active" | "archived"

    // auth
    session: null,
    isAdmin: false,
    checkedAdmin: false,

    // list
    tab: "seekers",
    searchTerm: "",
    seekers: [],
    hiring: [],
    seekersFacilitatedCount: 0,
    hiringFacilitatedCount: 0,
    sortState: {
      seekers: { key: "submitted_at", dir: "desc" },
      hiring: { key: "submitted_at", dir: "desc" }
    },
    filters: { work_preference: [], rating: [] },
    openFilter: null,
    filterDefs: [
      { group: "work_preference", label: "Work preference", options: WORK_PREFERENCE_OPTIONS },
      { group: "rating", label: "Rating", options: RATING_FILTER_OPTIONS }
    ],

    // overlay
    selected: null, // { kind: "seekers" | "hiring", record }
    draftNotes: "",
    notesSaving: null,
    error: "",
    busy: false,
    showClose: false,
    helpedDraft: false,
    deleteStep: 0,
    backdropDown: false,
    returnFocus: null,
    returnIndex: 0,
    toast: "",
    toastTimer: null,

    // ── Auth + loading ────────────────────────────────────────────────

    async init() {
      const { data: { session } } = await supabaseClient.auth.getSession();
      this.session = session;

      supabaseClient.auth.onAuthStateChange((_event, session) => {
        this.session = session;
      });

      if (this.session) {
        await this.checkAdminAndLoad();
      }
    },

    async login() {
      await supabaseClient.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: window.location.origin + (this.mode === "archived" ? "/admin/archive.html" : "/admin/") }
      });
    },

    async checkAdminAndLoad() {
      const { data, error } = await supabaseClient.rpc("is_admin");
      this.checkedAdmin = true;
      this.isAdmin = !error && data === true;
      if (this.isAdmin) {
        await this.loadData();
      }
    },

    async loadData() {
      const status = this.mode === "archived" ? "archived" : "active";

      const { data: seekers } = await supabaseClient
        .from(TABLES.seekers).select("*").eq("status", status).order("submitted_at", { ascending: false });
      const { data: hiring } = await supabaseClient
        .from(TABLES.hiring).select("*").eq("status", status).order("submitted_at", { ascending: false });

      this.seekers = seekers || [];
      this.hiring = hiring || [];

      if (this.mode === "active") await this.loadFacilitationCounts();
    },

    async loadFacilitationCounts() {
      const { count: seekerCount } = await supabaseClient
        .from(TABLES.seekers).select("*", { count: "exact", head: true }).eq("helped_facilitate", true);
      const { count: hiringCount } = await supabaseClient
        .from(TABLES.hiring).select("*", { count: "exact", head: true }).eq("helped_facilitate", true);

      this.seekersFacilitatedCount = seekerCount || 0;
      this.hiringFacilitatedCount = hiringCount || 0;
    },

    // ── Table: columns, filtering, sorting ───────────────────────────

    get columns() { return adminColumns(this.tab, this.mode); },
    get detailFields() { return this.selected ? adminDetailFields(this.selected.kind, this.mode) : []; },

    get filteredSeekers() {
      const term = this.searchTerm.trim().toLowerCase();
      const { work_preference, rating } = this.filters;
      return this.seekers.filter((s) => {
        if (work_preference.length && !work_preference.includes(s.work_preference)) return false;
        if (rating.length && !rating.includes(String(s.rating == null ? "unrated" : s.rating))) return false;
        if (!term) return true;
        const fields = this.mode === "archived"
          ? [s.name, s.location, s.notes, s.admin_notes]
          : [s.name, s.location, s.notes, s.relationship_note, s.work_preference, workPreferenceLabel(s.work_preference)];
        return fields.filter(Boolean).some((f) => f.toLowerCase().includes(term));
      });
    },

    get filteredHiring() {
      const term = this.searchTerm.trim().toLowerCase();
      if (!term) return this.hiring;
      return this.hiring.filter((h) => {
        const fields = this.mode === "archived" ? [h.name, h.notes, h.admin_notes] : [h.name, h.notes];
        return fields.filter(Boolean).some((f) => f.toLowerCase().includes(term));
      });
    },

    get rows() {
      const list = this.tab === "seekers" ? this.filteredSeekers : this.filteredHiring;
      const { key, dir } = this.sortState[this.tab];
      const col = this.columns.find((c) => c.key === key) || this.columns[0];
      const sign = dir === "asc" ? 1 : -1;
      return list.slice().sort((ra, rb) => {
        const a = this.sortValue(col, ra);
        const b = this.sortValue(col, rb);
        if (a == null && b == null) return 0;
        if (a == null) return 1; // empty values always sort last
        if (b == null) return -1;
        const cmp = typeof a === "string" ? a.localeCompare(b) : a - b;
        return cmp * sign;
      });
    },

    get totalCount() { return this.tab === "seekers" ? this.seekers.length : this.hiring.length; },

    get emptyText() {
      const state = this.mode === "archived" ? "archived" : "active";
      return this.tab === "seekers" ? `No ${state} job seekers match.` : `No ${state} hiring contacts match.`;
    },

    sortValue(col, row) {
      const v = row[col.key];
      switch (col.type) {
        case "date": return v ? new Date(v).getTime() : null;
        case "number": return v == null ? null : Number(v);
        case "bool": return v ? 1 : 0;
        case "pref": return v ? workPreferenceLabel(v).toLowerCase() : null;
        case "link": return v ? linkHost(v).toLowerCase() : null;
        default: return v ? String(v).toLowerCase() : null;
      }
    },

    cellText(col, row) {
      const v = row[col.key];
      switch (col.type) {
        case "date": return v ? new Date(v).toLocaleDateString() : "—";
        case "number": return v == null ? "—" : String(v);
        case "bool": return v ? "Yes" : "—";
        case "pref": return v ? workPreferenceLabel(v) : "—";
        default: return v || "—";
      }
    },

    setSort(col) {
      const current = this.sortState[this.tab];
      this.sortState[this.tab] = current.key === col.key
        ? { key: col.key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: "asc" };
    },
    ariaSort(col) {
      const s = this.sortState[this.tab];
      return s.key === col.key ? (s.dir === "asc" ? "ascending" : "descending") : "none";
    },
    sortArrow(col) {
      const s = this.sortState[this.tab];
      return s.key === col.key ? (s.dir === "asc" ? "▲" : "▼") : "";
    },

    toggleFilter(group, value) {
      const list = this.filters[group];
      this.filters[group] = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    },

    get chips() {
      const chips = [];
      if (this.tab === "seekers") {
        this.filterDefs.forEach((def) => {
          this.filters[def.group].forEach((value) => {
            const opt = def.options.find((o) => o.value === value);
            chips.push({ key: def.group + ":" + value, group: def.group, value, text: `${def.label}: ${opt ? opt.label : value}` });
          });
        });
      }
      if (this.searchTerm.trim()) {
        chips.push({ key: "search", group: "search", value: null, text: `Search: ${this.searchTerm.trim()}` });
      }
      return chips;
    },

    removeChip(chip) {
      if (chip.group === "search") this.searchTerm = "";
      else this.toggleFilter(chip.group, chip.value);
    },

    clearFilters() {
      this.filters = { work_preference: [], rating: [] };
      this.searchTerm = "";
      this.openFilter = null;
    },

    safeUrl,
    linkHost,

    // ── Overlay: open / close / focus ────────────────────────────────

    // rowEl: the table row that was activated; focus goes back to it on close.
    openRecord(kind, record, rowEl) {
      this.returnFocus = rowEl || null;
      this.returnIndex = Math.max(0, this.rows.indexOf(record));
      this.selected = { kind, record };
      this.draftNotes = record.admin_notes || "";
      this.error = "";
      this.showClose = false;
      this.helpedDraft = false;
      this.deleteStep = 0;
      document.body.classList.add("modal-open");
      const main = document.getElementById("admin-main");
      if (main) main.inert = true;
      this.$nextTick(() => { const d = document.getElementById("record-dialog"); if (d) d.focus(); });
    },

    // Closes immediately (no notes flush). Moves focus back to the row, or to
    // the nearest remaining row if the record was removed.
    closeOverlay() {
      const rf = this.returnFocus;
      this.selected = null;
      this.returnFocus = null;
      document.body.classList.remove("modal-open");
      const main = document.getElementById("admin-main");
      if (main) main.inert = false;
      this.$nextTick(() => {
        if (rf && document.contains(rf)) { rf.focus(); return; }
        const rowEls = document.querySelectorAll("#list-anchor tbody tr");
        const target = rowEls[Math.min(this.returnIndex, rowEls.length - 1)] || document.getElementById("list-anchor");
        if (target) target.focus();
      });
    },

    // Esc / Close button / backdrop: flush changed notes first; if that save
    // fails, stay open and show the error.
    async requestClose() {
      if (!this.selected || this.busy) return;
      this.busy = true;
      const ok = await this.flushNotes();
      this.busy = false;
      if (ok) this.closeOverlay();
    },

    // Only a press AND release on the backdrop itself closes (a text selection
    // dragged out of the card must not). backdropEl is the backdrop element.
    backdropMouse(event, backdropEl) { this.backdropDown = event.target === backdropEl; },
    backdropClick(event, backdropEl) {
      if (this.backdropDown && event.target === backdropEl) this.requestClose();
      this.backdropDown = false;
    },

    onEscape() {
      if (this.selected) {
        if (this.deleteStep === 1) this.deleteStep = 0;
        else this.requestClose();
      } else if (this.openFilter) {
        this.openFilter = null;
      }
    },

    // Keep Tab / Shift+Tab inside the dialog.
    trapTab(event) {
      const dialog = document.getElementById("record-dialog");
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((el) => el.offsetParent !== null);
      if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    },

    showToast(text) {
      this.toast = text;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => { this.toast = ""; }, 5000);
    },

    // ── Overlay: actions ─────────────────────────────────────────────

    // Save admin notes if they changed. Resolves true when nothing is left unsaved.
    saveNotes() {
      if (this.notesSaving) return this.notesSaving;
      const sel = this.selected;
      if (!sel) return Promise.resolve(true);
      const record = sel.record;
      const value = this.draftNotes;
      if (value === (record.admin_notes || "")) return Promise.resolve(true);

      this.notesSaving = (async () => {
        const { data, error } = await supabaseClient
          .from(TABLES[sel.kind]).update({ admin_notes: value }).eq("id", record.id).select("id");
        this.notesSaving = null;
        if (error || !data || data.length === 0) {
          this.error = ADMIN_ERROR_COPY;
          return false;
        }
        record.admin_notes = value;
        this.error = "";
        return true;
      })();
      return this.notesSaving;
    },

    // Wait for any save in flight, then save whatever changed since.
    async flushNotes() {
      for (let i = 0; i < 3; i++) {
        if (this.notesSaving) await this.notesSaving;
        if (!this.selected || this.draftNotes === (this.selected.record.admin_notes || "")) return true;
        if (!(await this.saveNotes())) return false;
      }
      return !this.selected || this.draftNotes === (this.selected.record.admin_notes || "");
    },

    async setRating(n) {
      const record = this.selected.record;
      const previous = record.rating;
      record.rating = n;
      const { data, error } = await supabaseClient
        .from(TABLES.seekers).update({ rating: n }).eq("id", record.id).select("id");
      if (error || !data || data.length === 0) {
        record.rating = previous;
        this.error = ADMIN_ERROR_COPY;
      } else {
        this.error = "";
      }
    },

    removeRecord(kind, id) {
      if (kind === "seekers") this.seekers = this.seekers.filter((s) => s.id !== id);
      else this.hiring = this.hiring.filter((h) => h.id !== id);
    },

    // Runs a status change / delete from the overlay, then drops the row.
    async runAction({ flush, request }) {
      if (this.busy || !this.selected) return;
      this.busy = true;
      try {
        if (flush && !(await this.flushNotes())) return;
        const { kind, record } = this.selected;
        const { data, error } = await request(TABLES[kind], record);
        if (error || !data || data.length === 0) { this.error = ADMIN_ERROR_COPY; return false; }
        this.removeRecord(kind, record.id);
        this.returnFocus = null; // the row is gone; focus moves to the nearest remaining row
        return true;
      } finally {
        this.busy = false;
      }
    },

    async archiveRecord() {
      const ok = await this.runAction({
        flush: true,
        request: (table, record) => supabaseClient.from(table)
          .update({ status: "archived", closed_at: new Date().toISOString(), helped_facilitate: this.helpedDraft })
          .eq("id", record.id).select("id")
      });
      if (ok) { await this.loadFacilitationCounts(); this.closeOverlay(); }
    },

    async unarchive() {
      const ok = await this.runAction({
        flush: true,
        request: (table, record) => supabaseClient.from(table)
          .update({ status: "active", closed_at: null, helped_facilitate: false })
          .eq("id", record.id).select("id")
      });
      if (ok) this.closeOverlay();
    },

    cancelDelete() {
      if (!this.busy) this.deleteStep = 0;
    },

    startDelete() {
      this.deleteStep = 1;
      this.$nextTick(() => { const b = document.getElementById("delete-cancel"); if (b) b.focus(); });
    },

    async deleteRecord() {
      // Notes aren't flushed: the record is going away.
      const ok = await this.runAction({
        flush: false,
        // .select() so a refused delete (RLS removes zero rows without an error) is detected
        request: (table, record) => supabaseClient.from(table).delete().eq("id", record.id).select("id")
      });
      if (ok) {
        if (this.mode === "active") await this.loadFacilitationCounts();
        this.closeOverlay();
        this.showToast(ADMIN_DELETED_COPY);
      }
    }
  };
}
