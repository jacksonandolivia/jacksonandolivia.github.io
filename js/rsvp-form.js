const RSVPForm = {
  guests: null,
  config: null,
  currentHousehold: null,
  currentLastName: null,
  submittedHouseholdId: null,

  async init() {
    const [guestsResp] = await Promise.all([
      fetch('/data/guests.json'),
    ]);
    this.guests = await guestsResp.json();
    this.config = API._config;
  },

  lookup(firstName, lastName) {
    const trimmedFirst = firstName.trim().toLowerCase();
    const trimmedLast = lastName.trim().toLowerCase();

    const matchedGuest = this.guests.find(
      g => g.firstName.toLowerCase() === trimmedFirst && g.lastName.toLowerCase() === trimmedLast
    );
    if (!matchedGuest) return null;

    const household = this.guests.filter(g => g.householdId === matchedGuest.householdId);
    this.currentHousehold = household;
    this.currentLastName = lastName.trim();
    return household;
  },

  render(container) {
    container.innerHTML = '';
    const existing = Storage.getRSVP(this.currentHousehold[0].householdId);

    const form = document.createElement('form');
    form.id = 'rsvp-form';
    form.noValidate = true;

    const heading = document.createElement('h2');
    heading.textContent = `RSVP for the ${this.currentLastName} Family`;
    form.appendChild(heading);

    if (existing) {
      const notice = document.createElement('p');
      notice.className = 'submitted-notice';
      notice.textContent = 'You have already submitted your RSVP for this household. Submitting again will update your previous response.';
      form.appendChild(notice);
    }

    const list = document.createElement('div');
    list.className = 'guest-list';

    this.currentHousehold.forEach((guest, index) => {
      const row = document.createElement('div');
      row.className = 'guest-row';
      row.dataset.index = index;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `attend-${guest.id}`;
      checkbox.className = 'attend-check';
      checkbox.checked = existing
        ? (existing.guests.find(g => g.guestId === guest.id)?.attending ?? guest.ageGroup === 'adult')
        : guest.ageGroup === 'adult';

      const label = document.createElement('label');
      label.htmlFor = `attend-${guest.id}`;
      label.className = 'guest-name';
      label.textContent = `${guest.firstName} ${guest.lastName}`;

      const badge = document.createElement('span');
      badge.className = `age-badge ${guest.ageGroup}`;
      badge.textContent = guest.ageGroup === 'adult' ? 'Adult' : 'Child';

      const mealGroup = document.createElement('div');
      mealGroup.className = 'meal-group';

      const mealLabel = document.createElement('label');
      mealLabel.htmlFor = `meal-${guest.id}`;
      mealLabel.textContent = 'Meal:';

      const mealSelect = document.createElement('select');
      mealSelect.id = `meal-${guest.id}`;
      mealSelect.className = 'meal-select';
      mealSelect.disabled = !checkbox.checked;

      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = '-- Select a meal --';
      mealSelect.appendChild(defaultOption);

      this.config.mealOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        mealSelect.appendChild(option);
      });

      if (existing) {
        const existingGuest = existing.guests.find(g => g.guestId === guest.id);
        if (existingGuest?.meal) {
          mealSelect.value = existingGuest.meal;
        }
      }

      mealGroup.appendChild(mealLabel);
      mealGroup.appendChild(mealSelect);

      const dietGroup = document.createElement('div');
      dietGroup.className = 'diet-group';

      const dietLabel = document.createElement('label');
      dietLabel.htmlFor = `diet-${guest.id}`;
      dietLabel.textContent = 'Dietary Restrictions:';

      const dietInput = document.createElement('input');
      dietInput.type = 'text';
      dietInput.id = `diet-${guest.id}`;
      dietInput.className = 'diet-input';
      dietInput.placeholder = 'Optional';

      if (existing) {
        const existingGuest = existing.guests.find(g => g.guestId === guest.id);
        if (existingGuest?.dietaryRestrictions) {
          dietInput.value = existingGuest.dietaryRestrictions;
        }
      }

      dietGroup.appendChild(dietLabel);
      dietGroup.appendChild(dietInput);

      const checkboxWrapper = document.createElement('div');
      checkboxWrapper.className = 'checkbox-wrapper';
      checkboxWrapper.appendChild(checkbox);
      checkboxWrapper.appendChild(label);
      checkboxWrapper.appendChild(badge);

      row.appendChild(checkboxWrapper);
      row.appendChild(mealGroup);
      row.appendChild(dietGroup);
      list.appendChild(row);

      checkbox.addEventListener('change', () => {
        mealSelect.disabled = !checkbox.checked;
        if (!checkbox.checked) {
          mealSelect.value = '';
        }
      });
    });

    form.appendChild(list);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'submit-btn';
    submitBtn.textContent = 'Submit RSVP';
    form.appendChild(submitBtn);

    const errorMsg = document.createElement('div');
    errorMsg.id = 'form-error';
    errorMsg.className = 'error-msg';
    errorMsg.hidden = true;
    form.appendChild(errorMsg);

    form.addEventListener('submit', (e) => this._handleSubmit(e));

    container.appendChild(form);
  },

  async _handleSubmit(e) {
    e.preventDefault();
    const errorEl = document.getElementById('form-error');
    errorEl.hidden = true;

    const rows = document.querySelectorAll('.guest-row');
    let hasAttending = false;
    const guestsData = [];

    for (const row of rows) {
      const index = parseInt(row.dataset.index);
      const guest = this.currentHousehold[index];
      const checkbox = document.getElementById(`attend-${guest.id}`);
      const mealSelect = document.getElementById(`meal-${guest.id}`);
      const dietInput = document.getElementById(`diet-${guest.id}`);

      const attending = checkbox.checked;

      if (attending) {
        hasAttending = true;
        if (!mealSelect.value) {
          errorEl.textContent = `Please select a meal for ${guest.firstName}.`;
          errorEl.hidden = false;
          mealSelect.focus();
          return;
        }
      }

      guestsData.push({
        guestId: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        attending,
        meal: attending ? mealSelect.value : '',
        dietaryRestrictions: dietInput.value.trim(),
      });
    }

    if (!hasAttending) {
      errorEl.textContent = 'Please select at least one guest to attend.';
      errorEl.hidden = false;
      return;
    }

    const payload = {
      householdId: this.currentHousehold[0].householdId,
      lastName: this.currentLastName,
      submittedAt: new Date().toISOString(),
      guests: guestsData,
    };

    await API.submitRSVP(payload);
    this._showConfirmation();
  },

  _showConfirmation() {
    const container = document.getElementById('rsvp-container');
    container.innerHTML = `
      <div class="confirmation">
        <h2>RSVP Received!</h2>
        <p>Thank you! Your RSVP for the <strong>${this.currentLastName}</strong> family has been saved.</p>
        <p>You can return here to update your response before the deadline.</p>
        <button id="new-rsvp-btn" class="submit-btn">Submit Another RSVP</button>
        <button id="logout-btn" class="logout-btn">Log Out</button>
      </div>
    `;

    document.getElementById('new-rsvp-btn').addEventListener('click', () => {
      this.currentHousehold = null;
      this.currentLastName = null;
      App.showLookup();
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      Auth.logout();
      App.showLogin();
    });
  },
};
