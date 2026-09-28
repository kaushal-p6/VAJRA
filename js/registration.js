/* ==========================================================================
   VAJRA - Authorized User Registration Workflow (Prototype)
   ==========================================================================
   NOTE: This is a frontend-only prototype for disaster-management official
   access requests. Real backend authority verification and database integration
   will be implemented in a future phase. No real API calls or documents are sent.
   ========================================================================== */

const VajraRegistration = {
  selectedFile: null,

  open() {
    this.resetForm();
    VajraUI.showModal("registration-modal");
  },

  close() {
    VajraUI.closeModal("registration-modal");
    if (!sessionStorage.getItem("vajra_entered")) {
      VajraUI.openLoginModal();
    }
  },

  backToLogin() {
    this.close();
    VajraUI.openLoginModal();
  },

  finishAndBackToLogin() {
    VajraUI.closeModal("reg-success-modal");
    VajraUI.openLoginModal();
  },

  handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // Client-side file validation (Max 5MB; PDF, JPG, PNG)
    const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    const maxSize = 5 * 1024 * 1024; // 5 MB

    if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png)$/i)) {
      this.showFieldError("err-reg-doc", "Please select a valid document (PDF, JPG, or PNG)");
      return;
    }

    if (file.size > maxSize) {
      this.showFieldError("err-reg-doc", "File size exceeds 5 MB limit");
      return;
    }

    this.selectedFile = file;
    this.clearFieldError("err-reg-doc");

    const emptyView = document.getElementById("dropzone-content-empty");
    const selectedView = document.getElementById("dropzone-content-selected");
    const nameEl = document.getElementById("selected-file-name");
    const sizeEl = document.getElementById("selected-file-size");

    if (emptyView) emptyView.style.display = "none";
    if (selectedView) selectedView.style.display = "block";
    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = `(${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
  },

  removeFile(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    this.selectedFile = null;
    const fileInput = document.getElementById("reg-doc-input");
    if (fileInput) fileInput.value = "";

    const emptyView = document.getElementById("dropzone-content-empty");
    const selectedView = document.getElementById("dropzone-content-selected");
    if (emptyView) emptyView.style.display = "block";
    if (selectedView) selectedView.style.display = "none";
  },

  resetForm() {
    const form = document.getElementById("vajra-registration-form");
    if (form) form.reset();
    this.removeFile();

    // Clear all inline errors
    document.querySelectorAll(".form-field-error").forEach(el => {
      el.textContent = "";
      el.style.display = "none";
    });
    document.querySelectorAll(".form-control.is-invalid").forEach(el => {
      el.classList.remove("is-invalid");
    });
  },

  showFieldError(id, msg, inputId = null) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = msg;
      el.style.display = "block";
    }
    if (inputId) {
      const inputEl = document.getElementById(inputId);
      if (inputEl) inputEl.classList.add("is-invalid");
    }
  },

  clearFieldError(id, inputId = null) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = "";
      el.style.display = "none";
    }
    if (inputId) {
      const inputEl = document.getElementById(inputId);
      if (inputEl) inputEl.classList.remove("is-invalid");
    }
  },

  handleSubmit(e) {
    e.preventDefault();

    // Clear previous errors
    document.querySelectorAll(".form-field-error").forEach(el => {
      el.textContent = "";
      el.style.display = "none";
    });
    document.querySelectorAll(".form-control.is-invalid").forEach(el => {
      el.classList.remove("is-invalid");
    });

    let isValid = true;
    let firstErrorField = null;

    const setError = (errorId, inputId, msg) => {
      isValid = false;
      this.showFieldError(errorId, msg, inputId);
      if (!firstErrorField) {
        firstErrorField = document.getElementById(inputId) || document.getElementById(errorId);
      }
    };

    // SECTION A Validation
    const fullname = (document.getElementById("reg-fullname")?.value || "").trim();
    if (!fullname) {
      setError("err-reg-fullname", "reg-fullname", "Full Name is required.");
    }

    const email = (document.getElementById("reg-email")?.value || "").trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      setError("err-reg-email", "reg-email", "Official Email Address is required.");
    } else if (!emailRegex.test(email)) {
      setError("err-reg-email", "reg-email", "Please enter a valid official email address.");
    }

    const mobile = (document.getElementById("reg-mobile")?.value || "").trim();
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobile) {
      setError("err-reg-mobile", "reg-mobile", "Mobile Number is required.");
    } else if (!mobileRegex.test(mobile)) {
      setError("err-reg-mobile", "reg-mobile", "Enter a valid 10-digit mobile number.");
    }

    // SECTION B Validation
    const org = document.getElementById("reg-org")?.value;
    if (!org) {
      setError("err-reg-org", "reg-org", "Please select your Organization / Department.");
    }

    const designation = (document.getElementById("reg-designation")?.value || "").trim();
    if (!designation) {
      setError("err-reg-designation", "reg-designation", "Designation is required.");
    }

    const empid = (document.getElementById("reg-empid")?.value || "").trim();
    if (!empid) {
      setError("err-reg-empid", "reg-empid", "Employee / Service ID is required.");
    }

    const state = document.getElementById("reg-state")?.value;
    if (!state) {
      setError("err-reg-state", "reg-state", "Please select your State / UT.");
    }

    const district = (document.getElementById("reg-district")?.value || "").trim();
    if (!district) {
      setError("err-reg-district", "reg-district", "District is required.");
    }

    const office = (document.getElementById("reg-office")?.value || "").trim();
    if (!office) {
      setError("err-reg-office", "reg-office", "Office / Unit Name is required.");
    }

    // SECTION C Validation
    const role = document.getElementById("reg-role")?.value;
    if (!role) {
      setError("err-reg-role", "reg-role", "Please select a Requested Role.");
    }

    const jurisdiction = (document.getElementById("reg-jurisdiction")?.value || "").trim();
    if (!jurisdiction) {
      setError("err-reg-jurisdiction", "reg-jurisdiction", "Area / Jurisdiction is required.");
    }

    const reason = (document.getElementById("reg-reason")?.value || "").trim();
    if (!reason) {
      setError("err-reg-reason", "reg-reason", "Please provide a reason for requesting VAJRA access.");
    } else if (reason.length < 15) {
      setError("err-reg-reason", "reg-reason", "Please provide a slightly more descriptive reason (min 15 chars).");
    }

    // SECTION D Validation
    if (!this.selectedFile) {
      setError("err-reg-doc", "file-dropzone", "Please upload an official authorization or service document.");
    }

    // Declaration Validation
    const consent = document.getElementById("reg-consent")?.checked;
    if (!consent) {
      setError("err-reg-consent", "reg-consent", "You must confirm the official declaration before submitting.");
    }

    if (!isValid) {
      if (firstErrorField) {
        firstErrorField.scrollIntoView({ behavior: "smooth", block: "center" });
        if (firstErrorField.focus) firstErrorField.focus();
      }
      return;
    }

    // Generate Frontend-Only Request ID: VAJRA-REQ-XXXXXX (6 random digits)
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    const reqId = `VAJRA-REQ-${randomDigits}`;

    // Store in localStorage for prototype demonstration persistence
    const submissionRecord = {
      requestId: reqId,
      fullName: fullname,
      email: email,
      org: org,
      designation: designation,
      state: state,
      district: district,
      role: role,
      status: "PENDING_AUTHORITY_REVIEW",
      submittedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem("vajra_pending_registration_req", JSON.stringify(submissionRecord));
    } catch (e) {
      // Ignore storage errors in restrictive environments
    }

    // Render Success Modal
    const displayIdEl = document.getElementById("success-display-req-id");
    if (displayIdEl) displayIdEl.textContent = reqId;

    // Transition from Registration Modal to Success Modal
    this.close();
    VajraUI.showModal("reg-success-modal");
  }
};
