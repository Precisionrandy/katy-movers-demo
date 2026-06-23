(function () {
  "use strict";

  // ── Demo ribbon dismiss ──
  var ribbon = document.getElementById("demoRibbon");
  var closeRibbon = document.getElementById("closeRibbon");
  if (closeRibbon) {
    closeRibbon.addEventListener("click", function () {
      ribbon.style.display = "none";
    });
  }

  // ── Step navigation ──
  var steps = {
    intro: document.querySelector('[data-step="intro"]'),
    form: document.querySelector('[data-step="form"]'),
    result: document.querySelector('[data-step="result"]'),
  };

  function showStep(name) {
    Object.keys(steps).forEach(function (key) {
      steps[key].hidden = key !== name;
    });
  }

  var chat = document.getElementById("aiChat");

  function addBotMessage(text) {
    var msg = document.createElement("div");
    msg.className = "ai-msg ai-msg--bot";
    var p = document.createElement("p");
    p.textContent = text;
    msg.appendChild(p);
    chat.appendChild(msg);
  }

  document.getElementById("startQuoteBtn").addEventListener("click", function () {
    addBotMessage("Great — let's get your details. This takes about 60 seconds.");
    showStep("form");
    document.getElementById("firstName").focus();
  });

  document.getElementById("resetQuoteBtn").addEventListener("click", function () {
    document.getElementById("quoteForm").reset();
    showStep("intro");
    var extraMsgs = chat.querySelectorAll(".ai-msg--bot");
    extraMsgs.forEach(function (m, i) {
      if (i > 0) m.remove();
    });
  });

  // ── Form submission ──
  var form = document.getElementById("quoteForm");
  var submitBtn = document.getElementById("submitQuoteBtn");

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var formData = new FormData(form);
    var specialItems = formData.getAll("specialItems");

    var payload = {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      phone: formData.get("phone"),
      email: formData.get("email") || null,
      moveDate: formData.get("moveDate"),
      homeSize: formData.get("homeSize"),
      originZip: formData.get("originZip"),
      destZip: formData.get("destZip"),
      specialItems: specialItems,
      howHeard: formData.get("howHeard") || null,
      source: "website_widget",
      businessSlug: "katy-movers-demo",
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Calculating your estimate&hellip;';

    fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Request failed");
        return res.json();
      })
      .then(function (data) {
        renderResult(data);
        showStep("result");
      })
      .catch(function () {
        renderError();
        showStep("result");
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="ti ti-sparkles" aria-hidden="true"></i> Get my instant estimate';
      });
  });

  function fmtMoney(n) {
    return "$" + Number(n).toLocaleString("en-US");
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  function renderResult(data) {
    var card = document.getElementById("resultCard");
    var specialItemsText = data.specialItems && data.specialItems.length
      ? data.specialItems.join(", ")
      : "None reported";

    var distanceLabel = data.moveType === "long-distance" ? "Long-distance move" : "Local move";

    card.innerHTML =
      '<div class="result-card__header">' +
        '<div class="result-card__check"><i class="ti ti-check" aria-hidden="true"></i></div>' +
        '<div>' +
          '<h4>You\u2019re all set, ' + escapeHtml(data.firstName) + '!</h4>' +
          '<p>Lead #' + escapeHtml(String(data.leadId)) + ' \u00b7 logged and routed automatically</p>' +
        '</div>' +
      '</div>' +
      '<div class="result-stat">' +
        '<p class="result-stat__label">Estimated cost</p>' +
        '<p class="result-stat__value">' + fmtMoney(data.estimate.low) + '\u2013' + fmtMoney(data.estimate.high) + '<span> total</span></p>' +
      '</div>' +
      '<div class="result-grid">' +
        '<div class="result-cell"><p class="result-cell__label">Move date</p><p class="result-cell__value">' + fmtDate(data.moveDate) + '</p></div>' +
        '<div class="result-cell"><p class="result-cell__label">Move type</p><p class="result-cell__value">' + distanceLabel + '</p></div>' +
        '<div class="result-cell"><p class="result-cell__label">Suggested crew</p><p class="result-cell__value">' + escapeHtml(data.estimate.crew) + '</p></div>' +
        '<div class="result-cell"><p class="result-cell__label">Suggested truck</p><p class="result-cell__value">' + escapeHtml(data.estimate.truck) + '</p></div>' +
      '</div>' +
      '<div class="result-cell" style="margin-bottom:14px;">' +
        '<p class="result-cell__label">Special items</p><p class="result-cell__value">' + escapeHtml(specialItemsText) + '</p>' +
      '</div>' +
      (data.shoppingAround
        ? '<div class="result-note"><i class="ti ti-flame" aria-hidden="true"></i> Heads up \u2014 in a live system, this lead would be flagged as an active shopper and the owner would get an instant text to call back fast.</div>'
        : '<div class="result-note"><i class="ti ti-message-circle" aria-hidden="true"></i> A confirmation text is on its way to ' + escapeHtml(data.phone) + ' right now \u2014 and a real team member will call to confirm details.</div>'
      );
  }

  function renderError() {
    var card = document.getElementById("resultCard");
    card.innerHTML =
      '<div class="result-note"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Something went wrong reaching the quote engine. In a live deployment this would automatically fall back to routing your call to a live team member \u2014 nothing falls through the cracks.</div>';
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  // ── Info modal ("How this was built") ──
  var modal = document.getElementById("infoModal");
  var howBuiltLink = document.getElementById("howBuiltLink");
  var infoModalClose = document.getElementById("infoModalClose");
  var infoModalBackdrop = document.getElementById("infoModalBackdrop");

  function openModal(e) {
    if (e) e.preventDefault();
    modal.hidden = false;
  }
  function closeModal() {
    modal.hidden = true;
  }

  if (howBuiltLink) howBuiltLink.addEventListener("click", openModal);
  if (infoModalClose) infoModalClose.addEventListener("click", closeModal);
  if (infoModalBackdrop) infoModalBackdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  // Auto-open the explainer once, right after a successful submit, so the
  // owner immediately understands what just happened technically.
  var hasShownExplainer = false;
  form.addEventListener("submit", function () {
    if (!hasShownExplainer) {
      hasShownExplainer = true;
      setTimeout(function () {
        if (!steps.result.hidden) openModal();
      }, 1400);
    }
  });

  // Set a sensible min date on the date picker (today)
  var moveDateInput = document.getElementById("moveDate");
  if (moveDateInput) {
    var today = new Date().toISOString().split("T")[0];
    moveDateInput.setAttribute("min", today);
  }
})();
