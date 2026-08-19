const RSVPForm = {
  guests: null,
  config: null,
  currentHousehold: null,
  currentLastName: null,
  submittedHouseholdId: null,
  emailPattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

  async init() {
    const [guestsResp] = await Promise.all([
      fetch('/data/guests.json'),
    ]);
    this.guests = await guestsResp.json();
    this.config = API._config;
  },

  lookup(firstName, lastName) {
    const trimmedFirst = firstName.trim().toLowerCase();
    const trimmedLast = (lastName || '').trim().toLowerCase();

    const matchedGuest = this.guests.find(
      g => g.firstName.toLowerCase() === trimmedFirst &&
           (trimmedLast === '' || g.lastName.toLowerCase() === trimmedLast)
    );
    if (!matchedGuest) return null;

    const household = this.guests.filter(g => g.householdId === matchedGuest.householdId);
    this.currentHousehold = household;
    this.currentLastName = lastName.trim();
    return household;
  },

  async render(container) {
    container.innerHTML = '';
    const existing = await API.getRSVP(this.currentHousehold[0].householdId);

    const mealOptionsTemplate = document.getElementById('meal-options-template');
    if (mealOptionsTemplate) {
      container.appendChild(mealOptionsTemplate.content.cloneNode(true));
    }

    const form = document.createElement('form');
    form.id = 'rsvp-form';
    form.noValidate = true;

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

      const existingGuest = existing ? existing.guests.find(g => g.guestId === guest.id) : null;

      const header = document.createElement('div');
      header.className = 'guest-header';
      let setNameEditable;
      let editNameButton;
      let saveNameButton;

      const hasPlaceholderName = [guest.firstName, guest.lastName]
        .some(name => name.toLowerCase().includes('guest'));

      if (hasPlaceholderName) {
        header.classList.add('guest-header-editable');
        const savedFirstName = existingGuest?.firstName || guest.firstName;
        const savedLastName = existingGuest?.lastName || guest.lastName;
        row.dataset.savedFirstName = savedFirstName;
        row.dataset.savedLastName = savedLastName;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'guest-name';
        nameSpan.textContent = `${savedFirstName} ${savedLastName}`.trim();

        const nameFields = document.createElement('div');
        nameFields.className = 'guest-name-fields';
        nameFields.hidden = true;

        const firstNameInput = document.createElement('input');
        firstNameInput.type = 'text';
        firstNameInput.id = `first-name-${guest.id}`;
        firstNameInput.className = 'guest-name-input';
        firstNameInput.placeholder = 'First Name';
        firstNameInput.autocomplete = 'given-name';
        firstNameInput.value = existingGuest?.firstName || '';
        firstNameInput.setAttribute('aria-label', 'First Name');
        firstNameInput.disabled = true;

        const lastNameInput = document.createElement('input');
        lastNameInput.type = 'text';
        lastNameInput.id = `last-name-${guest.id}`;
        lastNameInput.className = 'guest-name-input';
        lastNameInput.placeholder = 'Last Name';
        lastNameInput.autocomplete = 'family-name';
        lastNameInput.value = existingGuest?.lastName || '';
        lastNameInput.setAttribute('aria-label', 'Last Name');
        lastNameInput.disabled = true;

        let savedInputFirstName = firstNameInput.value;
        let savedInputLastName = lastNameInput.value;

        editNameButton = document.createElement('button');
        editNameButton.type = 'button';
        editNameButton.className = 'edit-guest-name-btn';
        editNameButton.textContent = 'Edit Name';
        editNameButton.hidden = true;

        saveNameButton = document.createElement('button');
        saveNameButton.type = 'button';
        saveNameButton.className = 'save-guest-name-btn';
        saveNameButton.textContent = 'Save';
        saveNameButton.hidden = true;

        nameFields.appendChild(firstNameInput);
        nameFields.appendChild(lastNameInput);
        header.appendChild(nameSpan);
        header.appendChild(nameFields);
        header.appendChild(saveNameButton);
        header.appendChild(editNameButton);

        setNameEditable = (editable, saveChanges = false) => {
          if (!editable && saveChanges) {
            const firstName = firstNameInput.value.trim();
            const lastName = lastNameInput.value.trim();

            if (!firstName || (!lastName && !isPlaceholder)) {
              const errorEl = document.getElementById('form-error');
              errorEl.textContent = 'Please enter both a first and last name for each guest.';
              errorEl.hidden = false;
              (firstName ? lastNameInput : firstNameInput).focus();
              return;
            }

            row.dataset.savedFirstName = firstName;
            row.dataset.savedLastName = lastName;
            savedInputFirstName = firstName;
            savedInputLastName = lastName;
            nameSpan.textContent = `${firstName} ${lastName}`.trim();

            // Clear any name validation error on successful save
            const errorEl = document.getElementById('form-error');
            if (errorEl && !errorEl.hidden) errorEl.hidden = true;
          }

          row.dataset.nameEditing = String(editable);
          nameSpan.hidden = editable;
          nameFields.hidden = !editable;
          firstNameInput.disabled = !editable;
          lastNameInput.disabled = !editable;
          saveNameButton.hidden = !editable;
          editNameButton.textContent = editable ? 'Cancel' : 'Edit Name';

          if (!editable) {
            firstNameInput.value = savedInputFirstName;
            lastNameInput.value = savedInputLastName;
          }
        };

        editNameButton.addEventListener('click', () => {
          setNameEditable(row.dataset.nameEditing !== 'true');
        });

        saveNameButton.addEventListener('click', () => {
          setNameEditable(false, true);
        });
      } else {
        const nameSpan = document.createElement('span');
        nameSpan.className = 'guest-name';
        nameSpan.textContent = `${guest.firstName} ${guest.lastName}`;
        header.appendChild(nameSpan);
      }

      const badge = document.createElement('span');
      badge.className = `age-badge ${guest.ageGroup}`;
      badge.textContent = guest.ageGroup === 'adult' ? 'Adult' : 'Child';

      header.appendChild(badge);

      const radioGroup = document.createElement('div');
      radioGroup.className = 'attend-radio-group';

      const radioYes = document.createElement('input');
      radioYes.type = 'radio';
      radioYes.name = `attend-${guest.id}`;
      radioYes.id = `attend-yes-${guest.id}`;
      radioYes.value = 'yes';
      radioYes.checked = existingGuest?.attending === true;

      const radioYesLabel = document.createElement('label');
      radioYesLabel.htmlFor = `attend-yes-${guest.id}`;
      radioYesLabel.textContent = 'Will Attend';

      const radioNo = document.createElement('input');
      radioNo.type = 'radio';
      radioNo.name = `attend-${guest.id}`;
      radioNo.id = `attend-no-${guest.id}`;
      radioNo.value = 'no';
      radioNo.checked = existingGuest?.attending === false;

      const radioNoLabel = document.createElement('label');
      radioNoLabel.htmlFor = `attend-no-${guest.id}`;
      radioNoLabel.textContent = 'Won\'t Attend';

      radioGroup.appendChild(radioYes);
      radioGroup.appendChild(radioYesLabel);
      radioGroup.appendChild(radioNo);
      radioGroup.appendChild(radioNoLabel);

      const mealGroup = document.createElement('div');
      mealGroup.className = 'meal-group';

      const mealLabel = document.createElement('label');
      mealLabel.htmlFor = `meal-${guest.id}`;
      mealLabel.textContent = 'Meal:';

      const mealSelect = document.createElement('select');
      mealSelect.id = `meal-${guest.id}`;
      mealSelect.className = 'meal-select';
      mealSelect.disabled = !radioYes.checked;

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

      if (existingGuest?.meal) {
        mealSelect.value = existingGuest.meal;
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

      if (existingGuest?.dietaryRestrictions) {
        dietInput.value = existingGuest.dietaryRestrictions;
      }

      dietGroup.appendChild(dietLabel);
      dietGroup.appendChild(dietInput);

      let emailGroup;
      if (guest.ageGroup === 'adult') {
        emailGroup = document.createElement('div');
        emailGroup.className = 'email-group';

        const emailLabel = document.createElement('label');
        emailLabel.htmlFor = `email-${guest.id}`;
        emailLabel.textContent = 'Email:';

        const emailInput = document.createElement('input');
        emailInput.type = 'email';
        emailInput.id = `email-${guest.id}`;
        emailInput.className = 'email-input';
        emailInput.placeholder = 'guest@example.com';
        emailInput.required = true;

        if (existingGuest?.email) {
          emailInput.value = existingGuest.email;
        }

        emailGroup.appendChild(emailLabel);
        emailGroup.appendChild(emailInput);
      }

      const toggleFields = () => {
        const isAttending = radioYes.checked;
        mealSelect.disabled = !isAttending;
        mealGroup.hidden = !isAttending;
        dietGroup.hidden = !isAttending;
        if (emailGroup) emailGroup.hidden = !isAttending;
        if (!isAttending) mealSelect.value = '';

        if (editNameButton) {
          editNameButton.hidden = !isAttending;
          if (!isAttending) setNameEditable(false);
        }
      };

      radioYes.addEventListener('change', toggleFields);
      radioNo.addEventListener('change', toggleFields);
      toggleFields();

      row.appendChild(header);
      row.appendChild(radioGroup);
      row.appendChild(mealGroup);
      row.appendChild(dietGroup);
      if (emailGroup) row.appendChild(emailGroup);
      list.appendChild(row);
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
    let hasEmail = false;
    const guestsData = [];

    for (const row of rows) {
      const index = parseInt(row.dataset.index);
      const guest = this.currentHousehold[index];
      const radioYes = document.getElementById(`attend-yes-${guest.id}`);
      const radioNo = document.getElementById(`attend-no-${guest.id}`);
      const mealSelect = document.getElementById(`meal-${guest.id}`);
      const dietInput = document.getElementById(`diet-${guest.id}`);
      const emailInput = document.getElementById(`email-${guest.id}`);
      const firstNameInput = document.getElementById(`first-name-${guest.id}`);
      const lastNameInput = document.getElementById(`last-name-${guest.id}`);
      const isNameEditing = row.dataset.nameEditing === 'true';
      const firstName = isNameEditing
        ? firstNameInput.value.trim()
        : (row.dataset.savedFirstName || guest.firstName);
      const lastName = isNameEditing
        ? lastNameInput.value.trim()
        : (row.dataset.savedLastName || guest.lastName);

      const isPlaceholder = guest.firstName.toLowerCase().includes('guest');

      if (isNameEditing && (!firstName || (!lastName && !isPlaceholder))) {
        errorEl.textContent = 'Please enter both a first and last name for each guest.';
        errorEl.hidden = false;
        (firstNameInput && !firstName ? firstNameInput : lastNameInput).focus();
        return;
      }

      if (!radioYes.checked && !radioNo.checked) {
        errorEl.textContent = `Please indicate whether ${firstName} ${lastName} will attend.`;
        errorEl.hidden = false;
        radioYes.focus();
        return;
      }

      const attending = radioYes.checked;

      // Fall back to the primary guest's last name for unnamed placeholder guests
      const effectiveLastName = (!lastName && isPlaceholder)
        ? (guestsData[0]?.lastName || this.currentLastName)
        : lastName;

      if (attending) {
        hasAttending = true;
        if (!mealSelect.value) {
          errorEl.textContent = `Please select a meal for ${firstName}.`;
          errorEl.hidden = false;
          mealSelect.focus();
          return;
        }
      }

      const email = emailInput ? emailInput.value.trim() : '';
      if (attending && email && !this.emailPattern.test(email)) {
        errorEl.textContent = `Please enter a valid email address for ${firstName} ${lastName}.`;
        errorEl.hidden = false;
        emailInput.focus();
        return;
      }

      if (attending && email) {
        hasEmail = true;
      }

      const guestData = {
        guestId: guest.id,
        firstName,
        attending,
        meal: attending ? mealSelect.value : '',
        dietaryRestrictions: dietInput.value.trim(),
        email: email || undefined,
      };

      if (effectiveLastName) guestData.lastName = effectiveLastName;
      guestsData.push(guestData);
    }

    if (hasAttending && !hasEmail) {
      errorEl.textContent = 'Please provide an email address for at least one attending guest.';
      errorEl.hidden = false;
      return;
    }

    const payload = {
      householdId: this.currentHousehold[0].householdId,
      lastName: this.currentLastName,
      submittedAt: new Date().toISOString(),
      guests: guestsData,
    };

    const submitBtn = document.querySelector('#rsvp-form .submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Submitting...';

    try {
      await API.submitRSVP(payload);
    } catch (error) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
      errorEl.textContent = error instanceof Error && error.message
        ? error.message
        : 'Something went wrong. Please try again.';
      errorEl.hidden = false;
      return;
    }

    this._showConfirmation(guestsData);
  },

  _mealLabel(value) {
    const opt = this.config.mealOptions.find(m => m.value === value);
    return opt ? opt.label : value;
  },

  _showConfirmation(guestsData) {
    document.getElementById('lookup-section').hidden = true;
    const container = document.getElementById('rsvp-container');
    const attendingGuests = guestsData.filter(g => g.attending);
    const notAttendingGuests = guestsData.filter(g => !g.attending);

    let summaryHtml = '<div class="confirmation"><h2>RSVP Received!</h2><p>Thank you! Your RSVP has been saved.</p>';

    if (attendingGuests.length) {
      summaryHtml += '<h3>Attending</h3><ul class="confirmation-list">';
      for (const g of attendingGuests) {
        const meal = g.meal ? this._mealLabel(g.meal) : '';
        const diet = g.dietaryRestrictions || '';
        summaryHtml += `<li><strong>${g.firstName} ${g.lastName}</strong>`;
        if (meal) summaryHtml += ` &mdash; ${meal}`;
        if (diet) summaryHtml += ` <span class="diet-note">(Diet: ${diet})</span>`;
        if (g.email) summaryHtml += ` <span class="email-note">(${g.email})</span>`;
        summaryHtml += '</li>';
      }
      summaryHtml += '</ul>';
    }

    if (notAttendingGuests.length) {
      summaryHtml += '<h3>Not Attending</h3><ul class="confirmation-list">';
      for (const g of notAttendingGuests) {
        summaryHtml += `<li>${g.firstName} ${g.lastName}</li>`;
      }
      summaryHtml += '</ul>';
    }

    summaryHtml += `
        <p>You can return here to update your response before the deadline.</p>
        <button id="edit-rsvp-btn" class="submit-btn">Edit RSVP</button>
        <a href="/" id="home-btn" class="logout-btn" style="text-decoration:none;">Return to Home</a>
      </div>
    `;

    container.innerHTML = summaryHtml;

    document.getElementById('edit-rsvp-btn').addEventListener('click', () => {
      this.render(container);
    });

  },
};
