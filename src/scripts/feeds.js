var feeds = {};


/**
 * Shows a UI to request an OAuth token. This should only be called in response
 * to user interaction to avoid confusing the user. Since the resulting window
 * is shown with no standard window decorations, it can end up below all other
 * windows, with no way to detect that it was shown, and no way to reposition
 * it either.
 */
feeds.requestInteractiveAuthToken = function() {
  chrome.identity.getAuthToken({'interactive': true}, function (accessToken) {
    if (chrome.runtime.lastError || !authToken) return;

    feeds.fetchCalendars();
  });
};

/**
 * Sends a request to fetch the list of calendars for the currently-logged in
 * user. When calendars are received, it automatically initiates a request
 * for events from those calendars.
 */
feeds.fetchCalendars = function(type) {
  chrome.extension.sendMessage({method: 'sync-icon.spinning.start'});

  chrome.storage.local.get('calendars', function(storage) {

    var storedCalendars = storage['calendars'] || {};
    chrome.identity.getAuthToken({'interactive': true}, function (authToken) {
      if (chrome.runtime.lastError) {
        chrome.extension.sendMessage({method: 'sync-icon.spinning.stop'});
        feeds.refreshUI();
        return;
      }

      $.ajax(constants.CALENDAR_LIST_API_URL, {
        headers: {
          'Authorization': 'Bearer ' + authToken
        },
        success: function(data) {
          var calendars = {};

          _.each(data.items, function(calendar){
            var storedCalendar = storedCalendars[calendar.id] || {};
            var calendarSelected = (calendar.selected)? true : false;

            var visible = (typeof storedCalendar.selected !== 'undefined') ?
                storedCalendar.selected : calendar.selected;

            var mergedCalendar = {
              id: calendar.id,
              summary: calendar.summary,
              accessRole: calendar.accessRole == 'writer' || calendar.accessRole == 'owner',
              description: calendar.description || '',
              foregroundColor: calendar.foregroundColor,
              backgroundColor: calendar.backgroundColor,
              colorId: calendar.colorId || '',
              selected: visible
            };

            if(storedCalendar.selected !== calendarSelected){
              // feeds.putCalendars(mergedCalendar, function(obj){});
            }

            calendars[calendar.id] = mergedCalendar;
          });

          chrome.storage.local.set({'calendars': calendars}, function() {
            if (chrome.runtime.lastError) {
              background.log('Error saving settings: ', chrome.runtime.lastError.message);
              return;
            }
            feeds.refreshUI();
          });
        },
        error: function(response) {
          chrome.extension.sendMessage({method: 'sync-icon.spinning.stop'});

          if (response.status === 401) {
            // feeds.refreshUI();
            chrome.identity.removeCachedAuthToken({ 'token': authToken }, function() {});
          }
        }
      });

    });
  });
};

feeds.putCalendars = function(feed, callback){
  var feedUrl = constants.CALENDAR_LIST_API_URL + '/' + encodeURIComponent(feed.id) + '?' + 'colorRgbFormat=false&fields=colorId,selected';

  var obj = JSON.stringify({
    "selected": (feed.visible)? true : false,
    "colorId": (feed.colorId)? feed.colorId : 11
  });

  console.log(feedUrl);
  console.log(obj);

  chrome.identity.getAuthToken({'interactive': false}, function (authToken) {
    if (chrome.runtime.lastError || !authToken) {
      chrome.extension.sendMessage({method: 'sync-icon.spinning.stop'});
      return;
    }

    $.ajax({
      type: 'PUT',
      url: feedUrl,
      headers: {
        'Authorization': 'Bearer ' + authToken
      },
      data: obj,
      contentType: "application/json",
      success: (function(response) {
        console.log(response);
        // console.log('Title: ' + resp.summary + " - selected: " + resp.selected + ' - colorID: ' + resp.colorId + ' - id: ' + resp.id);
        callback(null);

      }), error: function(response) {
        chrome.extension.sendMessage({method: 'sync-icon.spinning.stop'});
        if (response.status === 401) {
          // feeds.refreshUI();
          chrome.identity.removeCachedAuthToken({ 'token': authToken }, function() {});
        }
        // Must callback here, otherwise the caller keeps waiting for all calendars to load.
        callback(response);
      }
    });
  });
};


feeds.updateSets = function(){
  chrome.extension.sendMessage({method: 'sync-icon.spinning.start'});

  chrome.storage.local.get('calendars', function(calendarsObj) {
    chrome.storage.local.get('sets', function(setsObj) {

      var storedCalendars = calendarsObj['calendars'] || {};
      var storedSets = setsObj['sets'] || {};
      var newStoredCalendars = {};

      var setsObj = _.filter(storedSets, function(obj){
        return obj.selected === true;
      });

      _.each(storedCalendars, function(calendar){
        var calenderSelected = _.find(setsObj[0].selection, function(item){
          return calendar.id === item;
        });

        var mergedCalendar = {
          id: calendar.id,
          summary: calendar.summary,
          accessRole: calendar.accessRole == 'writer' || calendar.accessRole == 'owner',
          description: calendar.description || '',
          foregroundColor: calendar.foregroundColor,
          backgroundColor: calendar.backgroundColor,
          colorId: calendar.colorId || '',
          selected: false
        };

        if(calenderSelected){
          mergedCalendar.selected = true;
        }

        newStoredCalendars[mergedCalendar.id] = mergedCalendar;
      });

      async.each(newStoredCalendars, function(obj, callback){
        _.defer(function(){
          feeds.putCalendars(obj, function(response){callback(response)});
        });

      }, function(error){

        // if any of the file processing produced an error, err would equal that error
        if( error ) {
          // One of the iterations produced an error.
          // All processing will now stop.
          console.log('A file failed to process');
          console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
          console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
        } else {
          console.log('All files have been processed successfully');
          console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
          console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
        }
      });
    });
  });
};


/**
 * Updates the 'minutes/hours/days until' visible badge from the events
 * obtained during the last fetch. Does not fetch new data.
 */
feeds.refreshUI = function() {

  // Notify the browser action in case it's open.
  chrome.extension.sendMessage({method: 'sync-icon.spinning.stop'});
  chrome.extension.sendMessage({method: 'ui.refresh'});
};